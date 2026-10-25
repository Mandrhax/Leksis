// End-to-end checks in a real browser: sign-in → workspace → sign-out, and an admin disabling a user.
//
// Why it exists: two betas broke sign-in/sign-out because only the API had been tested. The server here
// listens on 0.0.0.0 like in Docker (which is what made Auth.js build 0.0.0.0 redirects), with no NEXTAUTH_URL.
//
// Prerequisite: `npm run build` (this script serves .next/standalone).
// Browser: set CHROME_PATH, otherwise Chrome / Chromium / Edge is looked up in the usual places.
// Database: an in-memory PGlite exposed on a local port, loaded from docker/init-schema.sql — no Docker needed.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { randomBytes, scryptSync } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import puppeteer from 'puppeteer-core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3111)
const DB_PORT = Number(process.env.E2E_DB_PORT ?? 5544)
const AI_PORT = Number(process.env.E2E_AI_PORT ?? 11555)
const BASE = `http://127.0.0.1:${APP_PORT}`

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  const found = candidates.find(p => p && existsSync(p))
  if (!found) throw new Error('No Chrome/Chromium/Edge found — set CHROME_PATH')
  return found
}

let failures = 0
function check(label, cond, detail = '') {
  if (!cond) failures++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${detail ? ` [${detail}]` : ''}`)
}

const standalone = join(root, '.next', 'standalone', 'server.js')
if (!existsSync(standalone)) throw new Error('.next/standalone not found — run `npm run build` first')
// `next build` does not copy these next to the standalone server (the Dockerfile does)
mkdirSync(join(root, '.next', 'standalone', '.next'), { recursive: true })
cpSync(join(root, '.next', 'static'), join(root, '.next', 'standalone', '.next', 'static'), { recursive: true })
if (existsSync(join(root, 'public'))) cpSync(join(root, 'public'), join(root, '.next', 'standalone', 'public'), { recursive: true })

// ── Database ────────────────────────────────────────────────────
const db = new PGlite()
// PGlite has no pgcrypto; gen_random_uuid() is built in since PostgreSQL 13
await db.exec(readFileSync(join(root, 'docker', 'init-schema.sql'), 'utf8').replace(/CREATE EXTENSION[^\n]*\n/g, ''))
// Log entries older than the default retention (365 days usage / 730 days audit), plus recent ones that must stay
await db.exec(`
  INSERT INTO usage_log (user_id, user_email, feature, created_at) SELECT 'old', 'old@x.ch', 'translate', NOW() - INTERVAL '400 days' FROM generate_series(1, 5);
  INSERT INTO usage_log (user_id, user_email, feature, created_at) VALUES ('new', 'new@x.ch', 'translate', NOW() - INTERVAL '1 day');
  INSERT INTO audit_log (user_id, user_email, action, resource, created_at) SELECT 'old', 'old@x.ch', 'OLD', 'x', NOW() - INTERVAL '800 days' FROM generate_series(1, 4);
`)
// Beyond maxConnections the socket server drops the connection (ECONNRESET): keep it well above the app's pool (10),
// which can briefly hold more sockets than that while old ones close
const dbServer = new PGLiteSocketServer({ db, port: DB_PORT, host: '127.0.0.1', maxConnections: 50 })
await dbServer.start()

// ── Fake AI server (Ollama API) ─────────────────────────────────
// Upper-cases every segment. When a segment contains MERGE it behaves like a weak model: for a group of more than
// two segments it drops the ||| separators, which is exactly what the document translation must survive.
const aiCalls = []
const aiServer = createServer((req, res) => {
  let body = ''
  req.on('data', d => { body += d })
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'fake-model', size: 1, modified_at: '' }] }))
    // Stands in for the GitHub release list (LEKSIS_UPDATE_CHECK_URL): the e2e never calls the Internet
    if (req.url === '/releases') {
      return res.end(JSON.stringify([
        { tag_name: 'v99.0.0', prerelease: false, draft: false, html_url: 'https://github.com/Mandrhax/Leksis/releases/tag/v99.0.0' },
        { tag_name: 'v1.0.0', prerelease: false, draft: false, html_url: 'https://github.com/Mandrhax/Leksis/releases/tag/v1.0.0' },
      ]))
    }
    if (req.url !== '/api/generate') { res.statusCode = 404; return res.end('{}') }
    const { prompt, stream } = JSON.parse(body)
    // Document batches (the app asks for them streamed too, like everything else since 1.11)
    if (prompt.includes('The segments are separated by ||| tokens')) {
      const joined = prompt.split('\n\n').pop()
      const parts = joined.split(' ||| ')
      aiCalls.push({ segments: parts.length, chars: joined.length, glossary: prompt.includes('Glossary —') })
      const weak = joined.includes('MERGE') && parts.length > 2
      const response = (weak ? parts.join(' ') : joined).toUpperCase()
      if (stream !== true) return res.end(JSON.stringify({ response, done: true }))
      res.setHeader('Content-Type', 'application/x-ndjson')
      return res.end(JSON.stringify({ response, done: false }) + '\n' + JSON.stringify({ response: '', done: true }) + '\n')
    }
    if (stream === true) return streamText(prompt, res)
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'unexpected non-streamed prompt' }))
  })
})
await new Promise(resolve => aiServer.listen(AI_PORT, '127.0.0.1', resolve))

// Text tab (streamed NDJSON, like Ollama): upper-cases the text to translate, blank lines kept. A text containing SLOW
// streams one character every 50 ms, to test cancellation: the call records whether the app cut the connection.
function streamText(prompt, res) {
  const text = /into [^:\n]+:\n\n([\s\S]*)$/.exec(prompt)?.[1] ?? ''
  const register = /Use the formal form/.test(prompt) ? 'formal' : /Use the informal form/.test(prompt) ? 'informal' : 'keep'
  const call = { stream: true, text, context: prompt.includes('For context only'), register, closed: false, finished: false }
  aiCalls.push(call)
  res.setHeader('Content-Type', 'application/x-ndjson')
  const out = text.toUpperCase()
  const send = s => res.write(JSON.stringify({ response: s, done: false }) + '\n')
  const end = () => { call.finished = true; res.end(JSON.stringify({ response: '', done: true }) + '\n') }
  if (!text.includes('SLOW')) { send(out); return end() }
  let i = 0
  const timer = setInterval(() => { if (i < out.length) send(out[i++]); else { clearInterval(timer); end() } }, 50)
  res.on('close', () => { clearInterval(timer); if (!call.finished) call.closed = true })
}

// ── App ─────────────────────────────────────────────────────────
const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(APP_PORT),
  HOSTNAME: '0.0.0.0',
  DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`,
  AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-0123',
  ENCRYPTION_KEY: '0'.repeat(64),
  NEXTAUTH_URL: '',
  LEKSIS_RETENTION_DELAY_SEC: '2', // the real default is 120 s
  AUTH_URL: '',
  AI_PROVIDER: 'ollama',
  AI_BASE_URL: `http://127.0.0.1:${AI_PORT}`,
  AI_MODEL: 'fake-model',
  AI_OCR_MODEL: 'fake-model',
  AI_REWRITE_MODEL: 'fake-model',
  LEKSIS_UPDATE_CHECK_URL: `http://127.0.0.1:${AI_PORT}/releases`,
}
const app = spawn(process.execPath, [standalone], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let appLog = ''
app.stdout.on('data', d => { appLog += d })
app.stderr.on('data', d => { appLog += d })

async function waitForApp() {
  for (let i = 0; i < 60; i++) {
    if (app.exitCode !== null) throw new Error('Server exited early:\n' + appLog)
    try { await fetch(BASE + '/auth/signin'); return } catch { await new Promise(r => setTimeout(r, 500)) }
  }
  throw new Error('Server did not start:\n' + appLog)
}

/** Signs in through the sign-in page (email → on-screen code → code) and returns once the workspace is showing. */
async function signInViaUi(page, email) {
  await page.goto(BASE + '/auth/signin', { waitUntil: 'networkidle0' })
  await page.type('input[type=email]', email)
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => /\b\d{6}\b/.test(document.body.innerText), { timeout: 15000 })
  const code = await page.evaluate(() => document.body.innerText.match(/\b\d{6}\b/)[0])
  await page.waitForSelector('input:not([type=email])')
  await page.type('input:not([type=email])', code)
  await Promise.all([
    page.waitForFunction(() => !location.pathname.startsWith('/auth/signin'), { timeout: 20000 }),
    page.keyboard.press('Enter'),
  ])
}

const sessionOf = page => page.evaluate(() => fetch('/api/auth/session').then(r => r.json()))
const noSession = s => s === null || Object.keys(s ?? {}).length === 0

let browser
try {
  await waitForApp()

  // ── Unauthenticated access ────────────────────────────────────
  const home = await fetch(BASE + '/', { redirect: 'manual' })
  const loc = home.headers.get('location') ?? ''
  check('anonymous visitor is redirected to the sign-in page', home.status >= 300 && home.status < 400 && new URL(loc, BASE).pathname === '/auth/signin', `${home.status} ${loc}`)
  // The internal address may appear inside `callbackUrl` (SignInForm only keeps its path); the redirect itself must stay relative
  check('the redirect does not point at the internal 0.0.0.0 address', !/^https?:\/\/0\.0\.0\.0/.test(loc), loc)
  // The proxy redirects anonymous requests to the sign-in page; requireUser() answers 401 behind it. Never a 200.
  const api = await fetch(BASE + '/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', redirect: 'manual' })
  check('AI routes refuse anonymous requests', api.status === 401 || (api.status >= 300 && api.status < 400), String(api.status))

  // ── Browser journey ───────────────────────────────────────────
  browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true, args: ['--lang=en-US', '--no-first-run', '--disable-gpu', '--no-sandbox'] })
  const page = await browser.newPage()
  const problems = []
  page.on('pageerror', e => problems.push('pageerror: ' + e.message.split('\n')[0]))
  page.on('console', m => { if (m.type() === 'error') problems.push('console.error: ' + m.text().split('\n')[0]) })

  await signInViaUi(page, 'e2e@example.com')
  const afterLogin = new URL(page.url())
  check('sign-in lands on the workspace, at the address used', afterLogin.origin === BASE && afterLogin.pathname === '/', page.url())

  const session = await sessionOf(page)
  check('a session exists after sign-in', session?.user?.email === 'e2e@example.com', JSON.stringify(session))

  const accountLabel = /account|compte|konto|profilo/i
  const signOutLabel = /sign out|déconnexion|se déconnecter|abmelden|esci/i
  await page.waitForFunction(re => [...document.querySelectorAll('button')].some(b => new RegExp(re, 'i').test(b.getAttribute('aria-label') || '')), { timeout: 15000 }, accountLabel.source)
  await page.evaluate(re => [...document.querySelectorAll('button')].find(b => new RegExp(re, 'i').test(b.getAttribute('aria-label') || '')).click(), accountLabel.source)
  await page.waitForFunction(re => [...document.querySelectorAll('button')].some(b => new RegExp(re, 'i').test(b.innerText)), { timeout: 10000 }, signOutLabel.source)
  await Promise.all([
    page.waitForFunction(() => location.pathname.startsWith('/auth/signin'), { timeout: 20000 }),
    page.evaluate(re => [...document.querySelectorAll('button')].find(b => new RegExp(re, 'i').test(b.innerText)).click(), signOutLabel.source),
  ])
  const afterLogout = new URL(page.url())
  check('sign-out lands on /auth/signin at the same address (not 0.0.0.0)', afterLogout.origin === BASE && afterLogout.pathname === '/auth/signin', page.url())
  const after = await sessionOf(page)
  check('the session is gone after sign-out', noSession(after), JSON.stringify(after))

  // ── Admin: disable a user ─────────────────────────────────────
  // A user signs in, an admin disables the account from /admin/users; the user's session must end and sign-in must be refused.
  const victimEmail = 'victim@example.com'
  const otp = email => fetch(BASE + '/api/auth/otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
  await otp('admin@example.com') // creates the account; promoted straight in the database (there is no other way to get a first admin)
  await db.query("UPDATE users SET role = 'admin' WHERE email = 'admin@example.com'")

  const victimCtx = await browser.createBrowserContext()
  const victim = await victimCtx.newPage()
  await signInViaUi(victim, victimEmail)
  check('the user to disable is signed in', (await sessionOf(victim))?.user?.email === victimEmail)

  const adminPage = await browser.newPage()
  const adminProblems = []
  adminPage.on('pageerror', e => adminProblems.push('pageerror@' + new URL(adminPage.url()).pathname + ': ' + e.message.split('\n')[0]))
  // HTTP errors are expected here: no Ollama / Caddy behind the metrics endpoints, and one 400 is provoked on purpose
  adminPage.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) adminProblems.push('console.error@' + new URL(adminPage.url()).pathname + ': ' + m.text().split('\n')[0]) })
  await signInViaUi(adminPage, 'admin@example.com')
  await adminPage.goto(BASE + '/admin/users', { waitUntil: 'networkidle0' })
  check('the admin sees the users page', new URL(adminPage.url()).pathname === '/admin/users', adminPage.url())

  await adminPage.type('input[type=search]', 'victim')
  await adminPage.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1 && document.body.innerText.includes('victim@example.com'), { timeout: 10000 })
  const clickInRow = (email, selector) => adminPage.evaluate((em, sel) => {
    const row = [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(em))
    row.querySelector(sel).click()
  }, email, selector)
  await clickInRow(victimEmail, 'button[role=switch][aria-label=Active]')
  await adminPage.waitForFunction(() => document.body.innerText.includes('Disabled'), { timeout: 10000 })
  const dbRow = await db.query("SELECT disabled FROM users WHERE email = 'victim@example.com'")
  check('the account is disabled in the database', dbRow.rows[0]?.disabled === true)

  check("the disabled user's session ends", noSession(await sessionOf(victim)), JSON.stringify(await sessionOf(victim)))
  const refused = await otp(victimEmail)
  check('a disabled account cannot ask for a sign-in code', refused.status === 403 && (await refused.json()).code === 'account_disabled', String(refused.status))

  await victim.goto(BASE + '/auth/signin', { waitUntil: 'networkidle0' })
  await victim.type('input[type=email]', victimEmail)
  await victim.keyboard.press('Enter')
  // "Contact your administrator" only exists in the translation, the server text is just "This account is disabled."
  await victim.waitForFunction(() => document.body.innerText.includes('Contact your administrator'), { timeout: 10000 })
  check('the sign-in page shows the translated "account disabled" message', true)

  await adminPage.goto(BASE + '/admin/users', { waitUntil: 'networkidle0' })
  const selfSwitchLocked = await adminPage.evaluate(() => {
    const row = [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes('admin@example.com'))
    return row?.querySelector('button[role=switch][aria-label=Active]')?.disabled === true
  })
  check('the users page does not let you disable your own account', selfSwitchLocked)
  const selfDisable = await adminPage.evaluate(async () => {
    const me = (await fetch('/api/auth/session').then(r => r.json())).user.id
    const r = await fetch('/api/admin/users/' + me, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ disabled: true }) })
    return { status: r.status, code: (await r.json()).code }
  })
  check('the API refuses an admin disabling themselves', selfDisable.status === 400 && selfDisable.code === 'self', JSON.stringify(selfDisable))

  const audit = await db.query("SELECT action FROM audit_log WHERE action = 'DISABLE_USER'")
  await adminPage.goto(BASE + '/admin/audit', { waitUntil: 'networkidle0' })
  check('the change is in the audit log', audit.rows.length === 1)
  const auditApi = await adminPage.evaluate(() => fetch('/api/admin/audit').then(r => r.json()))
  check('the audit log shows the account by email, not by id', auditApi.rows.some(r => r.action === 'DISABLE_USER' && r.resource_label === 'user:victim@example.com'), JSON.stringify(auditApi.rows.find(r => r.action === 'DISABLE_USER')?.resource_label))
  // ── Document translation: separators the model does not respect ──
  const translateDoc = (lines) => adminPage.evaluate(async text => {
    const form = new FormData()
    form.append('file', new File([text], 'doc.txt', { type: 'text/plain' }))
    form.append('targetLang', 'French')
    form.append('sourceLang', 'English')
    const r = await fetch('/api/translate/document', { method: 'POST', body: form })
    return { status: r.status, json: await r.json() }
  }, lines.join(String.fromCharCode(10)))
  const texts = out => out.json.blocks?.map(b => b.text)

  aiCalls.length = 0
  const weak = await translateDoc(['one', 'two MERGE', 'three', 'four', 'five'])
  check('a model that merges the separators still gives an aligned translation',
    weak.status === 200 && JSON.stringify(texts(weak)) === JSON.stringify(['ONE', 'TWO MERGE', 'THREE', 'FOUR', 'FIVE']), JSON.stringify(weak).slice(0, 200))
  check('the group was asked again and cut down instead of trusted', aiCalls.length > 2, JSON.stringify(aiCalls))
  check('the server logged that the model did not respect the separators', appLog.includes('separators not respected'))

  aiCalls.length = 0
  const longLines = Array.from({ length: 8 }, (_, i) => 'paragraph ' + (i + 1) + ' ' + 'x'.repeat(480))
  const long = await translateDoc(longLines)
  check('a long document is translated in several calls, in order',
    long.status === 200 && JSON.stringify(texts(long)) === JSON.stringify(longLines.map(l => l.toUpperCase())), String(long.status))
  check('each call stays within the batch size', aiCalls.length >= 2 && aiCalls.every(c => c.chars <= 3200), JSON.stringify(aiCalls))

  // The Document tab asks for a stream of events: progress batch by batch, then the result
  const streamed = await adminPage.evaluate(async text => {
    const form = new FormData()
    form.append('file', new File([text], 'doc.txt', { type: 'text/plain' }))
    form.append('targetLang', 'French')
    form.append('sourceLang', 'English')
    const r = await fetch('/api/translate/document', { method: 'POST', body: form, headers: { Accept: 'application/x-ndjson' } })
    return { type: r.headers.get('content-type'), events: (await r.text()).trim().split(String.fromCharCode(10)).map(l => JSON.parse(l)) }
  }, longLines.join(String.fromCharCode(10)))
  // A Word document is translated inside the original file: formatting and header kept
  const { Document: DocxDocument, Header: DocxHeader, Packer: DocxPacker, Paragraph: DocxParagraph, TextRun: DocxRun } = await import('docx')
  const wordFile = await DocxPacker.toBuffer(new DocxDocument({ sections: [{
    headers: { default: new DocxHeader({ children: [new DocxParagraph('Internal header')] }) },
    children: [new DocxParagraph({ children: [new DocxRun('Plain and '), new DocxRun({ text: 'bold text', bold: true })] })],
  }] }))
  const wordResult = await adminPage.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const form = new FormData()
    form.append('file', new File([bytes], 'letter.docx'))
    form.append('targetLang', 'French')
    form.append('sourceLang', 'English')
    const r = await fetch('/api/translate/document', { method: 'POST', body: form })
    return { status: r.status, json: await r.json() }
  }, Buffer.from(wordFile).toString('base64'))
  const JSZip = (await import('jszip')).default
  const wordZip = wordResult.json.docx ? await JSZip.loadAsync(Buffer.from(wordResult.json.docx, 'base64')) : null
  const wordBody = wordZip ? await wordZip.file('word/document.xml').async('string') : ''
  const wordHeader = wordZip ? await wordZip.file(Object.keys(wordZip.files).find(f => /^word\/header\d*\.xml$/.test(f))).async('string') : ''
  check('a Word document is translated inside the original file (bold run and header kept)',
    wordResult.status === 200 && wordBody.includes('PLAIN AND BOLD TEXT') && wordBody.includes('<w:b/>') && wordHeader.includes('INTERNAL HEADER'),
    JSON.stringify({ status: wordResult.status, blocks: wordResult.json.blocks, hasDocx: !!wordResult.json.docx }))

  const progressEvents = streamed.events.filter(e => e.progress)
  check('the document stream reports progress batch by batch, then the translated blocks',
    streamed.type?.startsWith('application/x-ndjson') && progressEvents.length >= 3
      && progressEvents.at(-1).progress.done === progressEvents.at(-1).progress.total
      && JSON.stringify(streamed.events.at(-1).blocks?.map(b => b.text)) === JSON.stringify(longLines.map(l => l.toUpperCase())),
    JSON.stringify(streamed.events.map(e => Object.keys(e)[0])))

  // ── Text translation: incremental paragraphs, cache, skips, cancellation, usage log ──
  const translateText = (text, extra = {}) => adminPage.evaluate(async (text, extra) => {
    const r = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text, sourceLang: 'English', sourceCode: 'en', targetLang: 'French', targetCode: 'fr',
        trigger: 'paste', requestGroupId: 'e2e-group', ...extra,
      }),
    })
    return { status: r.status, text: await r.text() }
  }, text, extra)
  const usageRows = group => db.query('SELECT status, trigger_type, char_count, model_chars, latency_ms FROM usage_log WHERE request_group_id = $1 ORDER BY created_at', [group]).then(r => r.rows)
  async function waitFor(cond, ms = 5000) {
    for (let t = 0; t < ms; t += 100) { if (await cond()) return true; await new Promise(r => setTimeout(r, 100)) }
    return false
  }

  const five = ['First paragraph of the text.', 'Second paragraph, with details.', 'Third paragraph, in the middle.',
    'Fourth paragraph, almost done.', 'Fifth paragraph, the end.'].join('\n\n')
  aiCalls.length = 0
  const firstText = await translateText(five)
  check('the first translation goes paragraph by paragraph (each one kept as soon as it is done)', firstText.status === 200 && firstText.text === five.toUpperCase() && aiCalls.length === 5 && aiCalls.slice(1).every(c => c.context), JSON.stringify({ firstText, aiCalls }))

  aiCalls.length = 0
  const editedFive = five.replace('in the middle', 'right in the middle')
  const editedText = await translateText(editedFive)
  check('modifying one paragraph out of five sends only that paragraph to the model',
    editedText.text === editedFive.toUpperCase() && aiCalls.length === 1 && aiCalls[0].text === 'Third paragraph, right in the middle.', JSON.stringify({ editedText, aiCalls }))
  check('the changed paragraph is sent with the previous one as context', aiCalls[0]?.context === true)

  aiCalls.length = 0
  const again = await translateText(editedFive)
  check('the same text again comes from the cache, without calling the model', again.text === editedFive.toUpperCase() && aiCalls.length === 0, JSON.stringify(aiCalls))

  const sameLang = await translateText('Bonjour à tous', { sourceLang: 'French', sourceCode: 'fr', targetLang: 'French (Switzerland)', targetCode: 'fr-CH' })
  check('a translation into the same language is refused without calling the model',
    sameLang.status === 400 && JSON.parse(sameLang.text).code === 'same_language' && aiCalls.length === 0, sameLang.text)

  await waitFor(async () => (await usageRows('e2e-group')).length >= 4)
  const textRows = await usageRows('e2e-group')
  check('usage_log records how each request ended', JSON.stringify(textRows.map(r => r.status)) === '["completed","completed","cache_hit","skipped"]', JSON.stringify(textRows))
  check('usage_log counts only the characters really sent to the model',
    textRows[0]?.model_chars > five.length && textRows[1]?.model_chars < textRows[1]?.char_count && textRows[2]?.model_chars === 0, JSON.stringify(textRows))
  check('usage_log keeps the trigger and the latency', textRows.every(r => r.trigger_type === 'paste' && r.latency_ms !== null), JSON.stringify(textRows))

  aiCalls.length = 0
  await adminPage.evaluate(async () => {
    const c = new AbortController()
    const r = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'A SLOW text that takes a while to translate.', sourceLang: 'English', sourceCode: 'en',
        targetLang: 'French', targetCode: 'fr', trigger: 'typing', requestGroupId: 'e2e-cancel',
      }),
      signal: c.signal,
    })
    await r.body.getReader().read()
    c.abort()
  }).catch(() => {})
  check('a cancelled translation stops the model (connection to the engine closed)', await waitFor(() => aiCalls[0]?.closed === true), JSON.stringify(aiCalls))
  await waitFor(async () => (await usageRows('e2e-cancel')).length === 1)
  check('the cancelled translation is logged as cancelled', (await usageRows('e2e-cancel'))[0]?.status === 'cancelled', JSON.stringify(await usageRows('e2e-cancel')))

  // In the Text tab: typing sends one request after the pause, Ctrl+Enter on the same text sends nothing
  aiCalls.length = 0
  await adminPage.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await adminPage.waitForSelector('#textTab textarea')
  await adminPage.type('#textTab textarea', 'Bonjour à tous, ceci est un texte de test', { delay: 30 })
  await adminPage.waitForFunction(() => (el => !!el && (el.innerText + [...el.querySelectorAll('textarea')].map(a => a.value).join(' ')).includes('BONJOUR À TOUS, CECI EST UN TEXTE DE TEST'))(document.querySelector('#textTab')), { timeout: 15000 })
  check('typing a sentence sends a single translation, after the pause', aiCalls.length === 1, JSON.stringify(aiCalls))
  await adminPage.focus('#textTab textarea')
  await adminPage.keyboard.down('Control')
  await adminPage.keyboard.press('Enter')
  await adminPage.keyboard.up('Control')
  await new Promise(r => setTimeout(r, 500))
  check('Ctrl+Enter on an unchanged text does not call the model again', aiCalls.length === 1, JSON.stringify(aiCalls))
  const formalityOffForEnglish = await adminPage.evaluate(() => !!document.querySelector('#textTab .formal-btn')?.disabled)
  check('formal / informal is greyed out for an English target (no distinction)', formalityOffForEnglish)

  // French text that says "vous", German target: the toggle switches to Formal by itself and the prompt asks for it
  aiCalls.length = 0
  await adminPage.evaluate(() => localStorage.setItem('leksisTargetLang', JSON.stringify({ code: 'de', name: 'German' })))
  await adminPage.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await adminPage.waitForSelector('#textTab textarea')
  await adminPage.type('#textTab textarea', 'Pourriez-vous nous envoyer votre rapport demain ?', { delay: 10 })
  await adminPage.waitForFunction(() => (el => !!el && (el.innerText + [...el.querySelectorAll('textarea')].map(a => a.value).join(' ')).includes('POURRIEZ-VOUS NOUS ENVOYER VOTRE RAPPORT DEMAIN ?'))(document.querySelector('#textTab')), { timeout: 15000 })
  const register = await adminPage.evaluate(() => ({
    active:   document.querySelector('#textTab .formal-btn.active')?.textContent,
    detected: !!document.querySelector('[data-testid=formality-detected]'),
  }))
  check('the form of address is detected in the text and selected automatically',
    register.active === 'Formal' && register.detected && aiCalls.at(-1)?.register === 'formal', JSON.stringify({ register, aiCalls }))

  // A click overrides the detection and is kept while the user goes on typing
  aiCalls.length = 0
  await adminPage.evaluate(() => [...document.querySelectorAll('#textTab .formal-btn')].find(b => b.textContent === 'Informal').click())
  await adminPage.type('#textTab textarea', ' Merci.', { delay: 10 })
  await adminPage.waitForFunction(() => (el => !!el && (el.innerText + [...el.querySelectorAll('textarea')].map(a => a.value).join(' ')).includes('MERCI.'))(document.querySelector('#textTab')), { timeout: 15000 })
  check('a manual formal / informal choice wins over the detection', aiCalls.length >= 1 && aiCalls.every(c => c.register === 'informal'), JSON.stringify(aiCalls))
  await adminPage.evaluate(() => localStorage.removeItem('leksisTargetLang'))

  // ── Dashboard: new version available ─────────────────────────
  await adminPage.goto(BASE + '/admin/dashboard', { waitUntil: 'networkidle0' })
  const updateBox = await adminPage.waitForSelector('[data-testid=update-available]', { timeout: 10000 }).then(el => el.evaluate(e => e.innerText)).catch(() => '')
  check('the dashboard says a new version is available', updateBox.includes('v99.0.0') && updateBox.includes('leksis update'), updateBox)
  const updateOff = await adminPage.evaluate(async () => {
    const general = (await fetch('/api/admin/settings').then(r => r.json())).general ?? {}
    await fetch('/api/admin/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'general', value: { ...general, updateCheck: false } }) })
    const info = await fetch('/api/admin/update-check').then(r => r.json())
    await fetch('/api/admin/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'general', value: { ...general, updateCheck: true } }) })
    return info.status
  })
  check('the version check can be switched off', updateOff === 'disabled', updateOff)

  // ── Log retention ──────────────────────────────────────────────
  check('the retention job is scheduled when the server starts', appLog.includes('[retention] scheduled'))
  let purged = false
  for (let i = 0; i < 20 && !purged; i++) {
    purged = Number((await db.query("SELECT count(*) AS n FROM usage_log WHERE user_id = 'old'")).rows[0].n) === 0
    if (!purged) await new Promise(r => setTimeout(r, 500))
  }
  check('usage entries older than the retention are deleted automatically', purged)
  check('recent usage entries are kept', Number((await db.query("SELECT count(*) AS n FROM usage_log WHERE user_id = 'new'")).rows[0].n) === 1)
  check('audit entries older than the retention are deleted', Number((await db.query("SELECT count(*) AS n FROM audit_log WHERE action = 'OLD'")).rows[0].n) === 0)
  check('the automatic purge is recorded in the audit log', Number((await db.query("SELECT count(*) AS n FROM audit_log WHERE action = 'AUTO_PURGE_USAGE' AND user_email = 'system'")).rows[0].n) === 1)

  await adminPage.goto(BASE + '/admin/settings', { waitUntil: 'networkidle0' })
  const retentionFields = await adminPage.evaluate(() => [...document.querySelectorAll('input[type=number]')].map(i => i.value))
  check('the settings page shows the default retention (365 / 730 days)', retentionFields.includes('365') && retentionFields.includes('730'), retentionFields.join(','))

  // ── Legal pages: public, generated from the real configuration ──
  const anon = (path) => fetch(BASE + path, { redirect: 'manual' }).then(async r => ({ status: r.status, text: await r.text() }))
  const privacy = await anon('/legal/privacy')
  check('the privacy policy is readable without signing in', privacy.status === 200 && privacy.text.includes('Privacy policy'), String(privacy.status))
  const usagePolicy = await anon('/legal/usage')
  check('the usage policy is readable without signing in', usagePolicy.status === 200 && usagePolicy.text.includes('Usage policy'), String(usagePolicy.status))
  check('an unknown legal page is a 404', (await anon('/legal/nope')).status === 404)
  // First render in the browser's language (no English flash): only French strings are sent
  const frSignin = await fetch(BASE + '/auth/signin', { headers: { 'Accept-Language': 'fr-CH,fr;q=0.9,en;q=0.8' } }).then(r => r.text())
  check('the sign-in page is rendered in the browser language from the first byte',
    frSignin.includes('<html lang="fr"') && frSignin.includes('Connectez-vous pour accéder à votre espace de travail.'), frSignin.slice(0, 120))
  const itSignin = await fetch(BASE + '/auth/signin', { headers: { cookie: 'leksisUILocale=it', 'Accept-Language': 'fr' } }).then(r => r.text())
  check('the language picked by the user (cookie) wins over the browser language', itSignin.includes('<html lang="it"'), itSignin.slice(0, 120))
  check('the privacy policy reflects the AI server (private network here) and the retention', privacy.text.includes('inside the private network') && privacy.text.includes('365 days'))
  const signinHtml = (await anon('/auth/signin')).text
  check('the sign-in page links to both policies', signinHtml.includes('href="/legal/privacy"') && signinHtml.includes('href="/legal/usage"'))
  const legalSave = await adminPage.evaluate(() => fetch('/api/admin/settings', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'legal', value: { organization: 'Acme SA', contact: 'privacy@acme.ch', privacyNotes: '<b>Note</b>', usageRules: '' } }),
  }).then(r => r.status))
  check('an admin can save the legal settings', legalSave === 200, String(legalSave))
  await new Promise(r => setTimeout(r, 5500)) // the page and the API route may not share the settings cache (5 s TTL)
  const privacy2 = await anon('/legal/privacy')
  check('the saved organisation and contact appear on the public page', privacy2.text.includes('Acme SA') && privacy2.text.includes('privacy@acme.ch'))
  check('admin text is shown as text, never as HTML', privacy2.text.includes('&lt;b&gt;Note&lt;/b&gt;') && !privacy2.text.includes('<b>Note</b>'))
  const legalTab = await adminPage.evaluate(() => [...document.querySelectorAll('button')].some(b => b.innerText.includes('Legal')))
  check('the settings page has a Legal tab', legalTab)

  // ── Upload refused: the server sends a code, not text to display ──
  const badLogo = await adminPage.evaluate(async () => {
    const form = new FormData()
    form.append('logo', new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], 'logo.svg', { type: 'image/svg+xml' }))
    const r = await fetch('/api/admin/logo', { method: 'POST', body: form })
    return { status: r.status, json: await r.json() }
  })
  check('an SVG logo is refused with a translatable error code', badLogo.status === 400 && badLogo.json.code === 'unsupported_format' && badLogo.json.formats?.includes('PNG'), JSON.stringify(badLogo))

  // ── Language list usable with the keyboard only ─────────────────
  await adminPage.goto(BASE + '/', { waitUntil: 'networkidle0' })
  // The tabs stay mounted (hidden): only the selectors on screen count — the 2nd one is the Text tab target
  const target = await adminPage.evaluateHandle(() =>
    [...document.querySelectorAll('[aria-haspopup="listbox"]')].filter(el => el.offsetParent !== null)[1])
  await target.focus()
  await adminPage.keyboard.press('Enter')
  const opened = await adminPage.waitForSelector('[role="combobox"]', { timeout: 5000 }).then(() => true, () => false)
  await adminPage.waitForFunction(() => document.activeElement?.getAttribute('role') === 'combobox', { timeout: 5000 }).catch(() => {})
  await adminPage.keyboard.type('germ')
  await adminPage.keyboard.press('Enter')
  const chosen = await adminPage.waitForFunction(el => /german/i.test(el.innerText), { timeout: 5000 }, target).then(() => true, () => false)
  const focusBack = await adminPage.evaluate(el => document.activeElement === el, target)
  check('a language can be chosen with the keyboard only, focus returns to the selector', opened && chosen && focusBack, JSON.stringify({ opened, chosen, focusBack }))

  // ── CSRF: an admin's cookie sent by another site is refused ─────
  const adminCookie = (await adminPage.cookies()).map(c => `${c.name}=${c.value}`).join('; ')
  const asAdmin = (path, origin, init = {}) => fetch(BASE + path, { ...init, headers: { ...init.headers, cookie: adminCookie, ...(origin ? { origin } : {}) } })
  const csrfCreate = await asAdmin('/api/admin/users', 'http://intranet.evil.example', {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ email: 'csrf@e2e.test', role: 'admin' }),
  })
  const csrfUser = await db.query("SELECT 1 FROM users WHERE email = 'csrf@e2e.test'")
  check('a request sent by another site with the admin cookie is refused (CSRF)', csrfCreate.status === 403 && csrfUser.rows.length === 0, String(csrfCreate.status))
  const csrfUserRoute = await asAdmin('/api/translate', 'http://intranet.evil.example', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  check('user API routes refuse a cross-site request too', csrfUserRoute.status === 403, String(csrfUserRoute.status))
  const sameOrigin = await asAdmin('/api/admin/audit', new URL(BASE).origin)
  check('the same cookie from the site itself still works', sameOrigin.status === 200, String(sameOrigin.status))

  // ── Reset to defaults ──────────────────────────────────────────
  const reset =await adminPage.evaluate(() => fetch('/api/admin/settings/reset', { method: 'POST' }).then(r => r.status))
  check('an admin can reset the settings to their defaults', reset === 200, String(reset))
  const stored = Object.fromEntries((await db.query('SELECT key, value FROM site_settings')).rows.map(r => [r.key, r.value]))
  check('every setting was written with its default', stored.branding?.siteName === 'Leksis' && stored.general?.usageRetentionDays === 365
    && stored.features?.limits?.maxDocChars === 12000 && stored.features?.limits?.maxImageMB === 10 && stored.rewrite_tones?.length === 6 && stored.legal?.organization === '', JSON.stringify(Object.keys(stored)))

  // ── Services → AI: engine cards and saving an Ollama server ─────
  await adminPage.goto(BASE + '/admin/services/ai', { waitUntil: 'networkidle0' })
  const cards = () => adminPage.evaluate(() => [...document.querySelectorAll('button[role=radio]')].map(b => ({
    text: b.innerText.replace(/\s+/g, ' ').trim(), checked: b.getAttribute('aria-checked') === 'true', disabled: b.disabled,
  })))
  await adminPage.waitForFunction(() => [...document.querySelectorAll('button[role=radio]')].some(b => b.disabled), { timeout: 10000 }).catch(() => {})
  let engine = await cards()
  check('the engine choice has three cards', engine.length === 3, JSON.stringify(engine.map(c => c.text)))
  check('an Ollama server at another address is shown as "another server"', engine[1]?.checked === true && engine[1].text.includes('another server'), JSON.stringify(engine.map(c => c.checked)))
  check('the local Ollama card is greyed out when the container is not there', engine[0]?.disabled === true && engine[0].text.includes('leksis config'), engine[0]?.text)

  const saveButton = () => adminPage.evaluate(() => {
    const b = [...document.querySelectorAll('button.btn-primary')].find(x => x.innerText.includes('Save'))
    return b ? { found: true, disabled: b.disabled } : { found: false }
  })
  const sb = await saveButton()
  check('the Save button is usable for an Ollama server (num_ctx accepted)', sb.found && sb.disabled === false, JSON.stringify(sb))
  await adminPage.evaluate(() => [...document.querySelectorAll('button.btn-primary')].find(x => x.innerText.includes('Save')).click())
  let saved = null
  for (let i = 0; i < 20 && !saved; i++) {
    const r = await db.query("SELECT value FROM site_settings WHERE key = 'ai_config'")
    saved = r.rows[0]?.value ?? null
    if (!saved) await new Promise(r => setTimeout(r, 500))
  }
  check('saving stores the Ollama server with its context size', saved?.provider === 'ollama' && saved.numCtx === 8192 && saved.baseUrl?.includes('127.0.0.1'), JSON.stringify(saved))

  await adminPage.evaluate(() => [...document.querySelectorAll('button[role=radio]')][2].click())
  await adminPage.waitForSelector('#ai-api-key', { timeout: 5000 })
  check('choosing the OpenAI-compatible API shows the API key field', true)
  await adminPage.evaluate(() => [...document.querySelectorAll('button[role=radio]')][1].click())
  await adminPage.waitForFunction(() => !document.querySelector('#ai-api-key'), { timeout: 5000 })
  engine = await cards()
  check('going back to "another server" selects that card again', engine[1]?.checked === true, JSON.stringify(engine.map(c => c.checked)))

  // ── Settings → AI tones: Italian labels (tones saved before Italian existed have none) ──
  const tonesNoItalian = [
    { id: 'professional', labels: { en: 'Professional', fr: 'Professionnel', de: 'Professionell' }, instruction: 'in a professional tone' },
    { id: 'casual', labels: { en: 'Casual', fr: 'Décontracté', de: 'Locker' }, instruction: 'in a casual tone' },
  ]
  await db.query("INSERT INTO site_settings (key, value) VALUES ('rewrite_tones', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [JSON.stringify(tonesNoItalian)])
  const openTonesTab = async () => {
    await adminPage.goto(BASE + '/admin/settings', { waitUntil: 'networkidle0' })
    await adminPage.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.includes('AI tones')).click())
    await adminPage.waitForFunction(() => [...document.querySelectorAll('span')].some(s => s.textContent === 'IT'), { timeout: 5000 })
  }
  const italianFields = () => adminPage.evaluate(() => [...document.querySelectorAll('span')].filter(s => s.textContent === 'IT').map(s => s.nextElementSibling.value))
  await openTonesTab()
  let it = await italianFields()
  check('a built-in tone saved without Italian shows its Italian name', it[0] === 'Professionale', JSON.stringify(it))
  const casualIt = await adminPage.evaluateHandle(() => [...document.querySelectorAll('span')].filter(s => s.textContent === 'IT')[1].nextElementSibling)
  await casualIt.click()
  await adminPage.keyboard.down('Control'); await adminPage.keyboard.press('KeyA'); await adminPage.keyboard.up('Control')
  await casualIt.type('Alla buona')
  await adminPage.evaluate(() => [...document.querySelectorAll('button.btn-primary')].find(b => b.offsetParent !== null && b.innerText.includes('Save')).click())
  let savedTones = null
  for (let i = 0; i < 20 && !savedTones?.[1]?.labels?.it; i++) {
    savedTones = (await db.query("SELECT value FROM site_settings WHERE key = 'rewrite_tones'")).rows[0]?.value ?? null
    if (!savedTones?.[1]?.labels?.it) await new Promise(r => setTimeout(r, 500))
  }
  check('saving the tones stores the Italian names', savedTones?.[0]?.labels?.it === 'Professionale' && savedTones?.[1]?.labels?.it === 'Alla buona', JSON.stringify(savedTones))
  await openTonesTab()
  it = await italianFields()
  check('the Italian names are still there after leaving the page and coming back', it[0] === 'Professionale' && it[1] === 'Alla buona', JSON.stringify(it))

  // ── Health endpoint: public, states only ──
  const healthRes = await fetch(BASE + '/api/health', { redirect: 'manual' })
  const health = await healthRes.json().catch(() => ({}))
  check('/api/health answers without a session, with states only', healthRes.status === 200 && health.status === 'ok' && health.checks?.database === 'ok' && Object.keys(health).length === 2, `${healthRes.status} ${JSON.stringify(health)}`)

  // ── Allowed email domains (all sign-in methods) ──
  const patchAuth = body => adminPage.evaluate(b => fetch('/api/admin/services', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  }).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) })), { service: 'auth', ...body })

  const selfLock = await patchAuth({ method: 'otp_display', allowedDomains: 'other.org' })
  check('a domain list that excludes the saving admin is refused', selfLock.status === 400 && selfLock.json.error === 'excludes_self', JSON.stringify(selfLock))

  const lockOn = await patchAuth({ method: 'otp_display', allowedDomains: 'Example.com, @acme.ch' })
  check('an admin can restrict sign-in to some domains', lockOn.status === 200, JSON.stringify(lockOn))
  const outsider = await otp('someone@other.org')
  check('an email code is refused for a domain outside the list', outsider.status === 403 && (await outsider.json()).code === 'domain_not_allowed', String(outsider.status))
  const neverCreated = (await db.query("SELECT 1 FROM users WHERE email = 'someone@other.org'")).rowCount
  check('and no account is created for it', neverCreated === 0)
  const insider = await otp('colleague@acme.ch')
  check('a listed domain still gets its code', insider.status === 200, String(insider.status))
  const stillIn = await sessionOf(adminPage)
  check('the admin session (listed domain) stays valid', stillIn?.user?.email === 'admin@example.com', JSON.stringify(stillIn))
  const lockOff = await patchAuth({ method: 'otp_display', allowedDomains: '' })
  check('clearing the list removes the restriction', lockOff.status === 200 && (await otp('someone@other.org')).status === 200)
  await db.query("DELETE FROM users WHERE email IN ('someone@other.org', 'colleague@acme.ch')")

  // ── Invitation only: no account is created on its own; an admin creates them in advance ──
  const inviteOn = await patchAuth({ method: 'otp_display', allowedDomains: '', inviteOnly: true })
  check('an admin can switch to invitation only', inviteOn.status === 200, JSON.stringify(inviteOn))
  const stranger = await otp('stranger@example.com')
  check('an email code is refused for someone who was not invited', stranger.status === 403 && (await stranger.json()).code === 'not_invited', String(stranger.status))
  check('and no account is created for them', (await db.query("SELECT 1 FROM users WHERE email = 'stranger@example.com'")).rowCount === 0)
  const postUser = body => adminPage.evaluate(b => fetch('/api/admin/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  }).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) })), body)
  const invited = await postUser({ email: 'Invited@Example.com', name: 'Invited One' })
  check('an admin can invite a user', invited.status === 201 && invited.json.user?.email === 'invited@example.com', JSON.stringify(invited))
  check('inviting the same email again is refused', (await postUser({ email: 'invited@example.com' })).status === 409)
  check('an invalid email is refused', (await postUser({ email: 'not-an-email' })).status === 400)
  const invitedCode = await otp('invited@example.com')
  check('the invited person gets their code', invitedCode.status === 200, String(invitedCode.status))
  check('the invitation is audited', (await db.query("SELECT 1 FROM audit_log WHERE action = 'INVITE_USER'")).rowCount === 1)
  const inviteOff = await patchAuth({ method: 'otp_display', allowedDomains: '', inviteOnly: false })
  check('switching invitation only off lets codes be requested for new emails again', inviteOff.status === 200 && (await otp('stranger@example.com')).status === 200)
  await db.query("DELETE FROM users WHERE email IN ('stranger@example.com', 'invited@example.com')")

  // ── Sign-in method: switch to password + admin approval via the Connexion tab, sign up, approve, sign in ──
  await adminPage.goto(BASE + '/admin/settings', { waitUntil: 'networkidle0' })
  await adminPage.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.includes('Sign-in'))?.click())
  await adminPage.waitForFunction(() => [...document.querySelectorAll('button[role=radio]')].some(b => b.innerText.includes('admin approval')), { timeout: 10000 })
  await adminPage.evaluate(() => [...document.querySelectorAll('button[role=radio]')].find(b => b.innerText.includes('admin approval'))?.click())
  await adminPage.evaluate(() => [...document.querySelectorAll('button.btn-primary')].find(b => b.offsetParent !== null && b.innerText.includes('Save'))?.click())
  let authConfig = null
  for (let i = 0; i < 20 && authConfig?.method !== 'password_admin_approval'; i++) {
    authConfig = (await db.query("SELECT value FROM site_settings WHERE key = 'auth_config'")).rows[0]?.value ?? null
    if (authConfig?.method !== 'password_admin_approval') await new Promise(r => setTimeout(r, 500))
  }
  check('the admin can switch the sign-in method to password + admin approval via the Connexion tab', authConfig?.method === 'password_admin_approval', JSON.stringify(authConfig))

  // /auth/signup redirects away until the server-rendered sign-in page itself reflects the new method
  // (force-dynamic avoids an indefinite cache, but the very next request or two can still race the write)
  let signupReachable = false
  for (let i = 0; i < 20 && !signupReachable; i++) {
    const res = await fetch(BASE + '/auth/signup', { redirect: 'manual' })
    signupReachable = res.status === 200
    if (!signupReachable) await new Promise(r => setTimeout(r, 300))
  }
  check('the sign-up page stops redirecting once the server reflects the new method', signupReachable)

  const signupCtx = await browser.createBrowserContext()
  const signupPage = await signupCtx.newPage()
  await signupPage.goto(BASE + '/auth/signup', { waitUntil: 'networkidle0' })
  check('the sign-up page is reachable once password sign-up is active', new URL(signupPage.url()).pathname === '/auth/signup', signupPage.url())

  const newEmail = 'newbie@example.com'
  await signupPage.type('#email', newEmail)
  await signupPage.type('#password', 'a very long password 123')
  await signupPage.type('#confirm', 'a very long password 123')
  await Promise.all([
    signupPage.waitForFunction(() => document.body.innerText.includes('Request received'), { timeout: 10000 }),
    signupPage.evaluate(() => [...document.querySelectorAll('button.action-btn')].find(b => b.innerText.includes('Create account'))?.click()),
  ])
  check('signing up shows the pending-approval confirmation', true)

  let newUser = null
  for (let i = 0; i < 20 && !newUser; i++) {
    newUser = (await db.query('SELECT status, password_hash FROM users WHERE email = $1', [newEmail])).rows[0] ?? null
    if (!newUser) await new Promise(r => setTimeout(r, 500))
  }
  check('the new account is pending_approval with a password hash set', newUser?.status === 'pending_approval' && !!newUser?.password_hash, JSON.stringify(newUser))

  // Anti pré-piratage : s'inscrire avec l'email de l'admin (compte sans mot de passe) ne doit rien modifier
  const hijack = await fetch(BASE + '/api/auth/signup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'attacker password 123' }),
  })
  const adminRow = (await db.query("SELECT status, password_hash FROM users WHERE email = 'admin@example.com'")).rows[0]
  check('signing up with an existing passwordless account (the admin) is refused and changes nothing',
    hijack.status === 409 && adminRow.status === 'active' && adminRow.password_hash === null, `${hijack.status} ${JSON.stringify(adminRow)}`)

  // Un GET sur le lien de vérification (scanner de messagerie) ne doit pas activer le compte
  // Same format as src/lib/password.ts
  const scryptHash = pw => { const salt = randomBytes(16); return `scrypt:16384:8:1:${salt.toString('hex')}:${scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}` }
  await db.query("INSERT INTO users (email, password_hash, status) VALUES ('pv@example.com', $1, 'pending_verification')", [scryptHash('owner password 123')])
  await db.query("INSERT INTO email_tokens (email, token, purpose, expires_at) VALUES ('pv@example.com', 'e2e-verify-token', 'verify_email', NOW() + INTERVAL '1 hour')")
  const prefetch = await fetch(BASE + '/api/auth/verify-email?token=e2e-verify-token', { redirect: 'manual' })
  const pvAfterGet = (await db.query("SELECT status FROM users WHERE email = 'pv@example.com'")).rows[0]
  check('opening the email link (GET) does not activate the account', prefetch.status >= 300 && prefetch.status < 400 && pvAfterGet.status === 'pending_verification', `${prefetch.status} ${pvAfterGet.status}`)
  const confirmWith = password => fetch(BASE + '/api/auth/verify-email', {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: 'e2e-verify-token', password }).toString(),
  })
  // Pre-registration: whoever holds the email link must also know the password chosen at sign-up
  const wrongPw = await confirmWith('someone else 123')
  const pvAfterWrong = (await db.query("SELECT status FROM users WHERE email = 'pv@example.com'")).rows[0]
  check('confirming without the sign-up password activates nothing and keeps the link usable',
    wrongPw.status === 303 && (wrongPw.headers.get('location') ?? '').includes('error=password') && pvAfterWrong.status === 'pending_verification',
    `${wrongPw.status} ${wrongPw.headers.get('location')} ${pvAfterWrong.status}`)
  const confirm = await confirmWith('owner password 123')
  const pvAfterPost = (await db.query("SELECT status FROM users WHERE email = 'pv@example.com'")).rows[0]
  check('confirming with a POST and the sign-up password activates the account', confirm.status === 303 && pvAfterPost.status === 'active', `${confirm.status} ${pvAfterPost.status}`)

  await adminPage.goto(BASE + '/admin/users', { waitUntil: 'networkidle0' })
  await adminPage.type('input[type=search]', 'newbie')
  await adminPage.waitForFunction(() => document.body.innerText.includes('Pending approval'), { timeout: 10000 })
  check('the pending signup shows a "Pending approval" badge in the admin Users page', true)

  await adminPage.evaluate(email => {
    const row = [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(email))
    ;[...row.querySelectorAll('button')].find(b => b.innerText.trim() === 'Approve')?.click()
  }, newEmail)
  let approved = null
  for (let i = 0; i < 20 && approved?.status !== 'active'; i++) {
    approved = (await db.query('SELECT status FROM users WHERE email = $1', [newEmail])).rows[0] ?? null
    if (approved?.status !== 'active') await new Promise(r => setTimeout(r, 500))
  }
  check('approving the account activates it', approved?.status === 'active', JSON.stringify(approved))

  await signupPage.goto(BASE + '/auth/signin', { waitUntil: 'networkidle0' })
  await signupPage.type('#email', newEmail)
  await signupPage.type('#password', 'a very long password 123')
  await Promise.all([
    signupPage.waitForFunction(() => !location.pathname.startsWith('/auth/signin'), { timeout: 15000 }),
    signupPage.evaluate(() => [...document.querySelectorAll('button.action-btn')].find(b => b.innerText.includes('Sign in'))?.click()),
  ])
  const newSession = await sessionOf(signupPage)
  check('the approved account can sign in with its password', newSession?.user?.email === newEmail, JSON.stringify(newSession))

  // ── Invitation link: the invited person chooses their own password ──
  const linkedInvite = await postUser({ email: 'linked@example.com', name: 'Linked One' })
  check('an admin can invite a user while password sign-in is active', linkedInvite.status === 201, JSON.stringify(linkedInvite))
  const linkRes = await adminPage.evaluate(id => fetch(`/api/admin/users/${id}/invite-link`, { method: 'POST' }).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) })), linkedInvite.json.user.id)
  const inviteLink = linkRes.json.link ?? ''
  check('an invitation link is generated for them', linkRes.status === 200 && inviteLink.includes('/auth/invite?token='), JSON.stringify(linkRes))

  const inviteCtx = await browser.createBrowserContext()
  const invitePage = await inviteCtx.newPage()
  await invitePage.goto(BASE + new URL(inviteLink).pathname + new URL(inviteLink).search, { waitUntil: 'networkidle0' })
  await invitePage.waitForSelector('#password', { timeout: 10000 })
  check('the link opens a "choose your password" form for that email', (await invitePage.evaluate(() => document.body.innerText)).includes('linked@example.com'))
  await invitePage.type('#password', 'my own invited password 1')
  await invitePage.type('#confirm', 'my own invited password 1')
  await Promise.all([
    invitePage.waitForFunction(() => document.body.innerText.includes('Password saved'), { timeout: 10000 }),
    invitePage.evaluate(() => [...document.querySelectorAll('button.action-btn')].find(b => b.innerText.includes('Set my password'))?.click()),
  ])
  check('choosing a password through the link succeeds', true)

  await invitePage.goto(BASE + new URL(inviteLink).pathname + new URL(inviteLink).search, { waitUntil: 'networkidle0' })
  check('the same link cannot be used twice', (await invitePage.evaluate(() => document.body.innerText)).includes('invalid or has expired'))

  await invitePage.goto(BASE + '/auth/signin', { waitUntil: 'networkidle0' })
  await invitePage.type('#email', 'linked@example.com')
  await invitePage.type('#password', 'my own invited password 1')
  await Promise.all([
    invitePage.waitForFunction(() => !location.pathname.startsWith('/auth/signin'), { timeout: 15000 }),
    invitePage.evaluate(() => [...document.querySelectorAll('button.action-btn')].find(b => b.innerText.includes('Sign in'))?.click()),
  ])
  const linkedSession = await sessionOf(invitePage)
  check('the invited person signs in with the password they chose', linkedSession?.user?.email === 'linked@example.com', JSON.stringify(linkedSession))
  const linkAudit = (await db.query("SELECT detail FROM audit_log WHERE action = 'INVITE_LINK'")).rows
  check('the link generation is audited without the token', linkAudit.length === 1 && !JSON.stringify(linkAudit).includes(inviteLink.split('token=')[1]), JSON.stringify(linkAudit))

  // ── Settings: change my own password ────────────────────────────
  const oldPassword = 'a very long password 123'
  const newPassword = 'a different long password 456'
  await signupPage.goto(BASE + '/settings', { waitUntil: 'networkidle0' })
  await signupPage.waitForSelector('input[type=password]', { timeout: 10000 })
  const pwFields = await signupPage.$$('input[type=password]')
  check('the change-password form has three fields', pwFields.length === 3, String(pwFields.length))
  await pwFields[0].type(oldPassword)
  await pwFields[1].type(newPassword)
  await pwFields[2].type(newPassword)
  await Promise.all([
    signupPage.waitForFunction(() => document.body.innerText.includes('Password changed'), { timeout: 10000 }),
    signupPage.evaluate(() => [...document.querySelectorAll('button.action-btn')].find(b => b.innerText.includes('Change password'))?.click()),
  ])
  check('changing the password from Settings shows a success message', true)

  await signupPage.goto(BASE + '/auth/signin', { waitUntil: 'networkidle0' })
  await signupPage.type('#email', newEmail)
  await signupPage.type('#password', oldPassword)
  await signupPage.evaluate(() => [...document.querySelectorAll('button.action-btn')].find(b => b.innerText.includes('Sign in'))?.click())
  await new Promise(r => setTimeout(r, 1500))
  check('the old password no longer works', new URL(signupPage.url()).pathname === '/auth/signin', signupPage.url())

  await signupPage.goto(BASE + '/auth/signin', { waitUntil: 'networkidle0' })
  await signupPage.type('#email', newEmail)
  await signupPage.type('#password', newPassword)
  await Promise.all([
    signupPage.waitForFunction(() => !location.pathname.startsWith('/auth/signin'), { timeout: 15000 }),
    signupPage.evaluate(() => [...document.querySelectorAll('button.action-btn')].find(b => b.innerText.includes('Sign in'))?.click()),
  ])
  const afterChangeSession = await sessionOf(signupPage)
  check('the new password signs in', afterChangeSession?.user?.email === newEmail, JSON.stringify(afterChangeSession))

  // ── Admin: reset another user's password ────────────────────────
  await adminPage.goto(BASE + '/admin/users', { waitUntil: 'networkidle0' })
  await adminPage.evaluate(() => { const i = document.querySelector('input[type=search]'); if (i) i.value = '' })
  await adminPage.type('input[type=search]', 'newbie')
  await adminPage.waitForFunction(() => document.body.innerText.includes('newbie@example.com'), { timeout: 10000 })
  await clickInRow(newEmail, 'button[title="Reset password"]')
  await adminPage.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.innerText.trim() === 'Reset'), { timeout: 10000 })
  await adminPage.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Reset')?.click())
  await adminPage.waitForFunction(() => document.body.innerText.includes('Password reset'), { timeout: 10000 })
  await adminPage.waitForSelector('code', { timeout: 10000 })
  const adminResetPassword = await adminPage.evaluate(() => document.querySelector('code')?.textContent ?? '')
  check('the admin sees the generated password once', adminResetPassword.length >= 20, adminResetPassword.length)
  await adminPage.evaluate(() => [...document.querySelectorAll('button.btn-primary')].find(b => b.innerText.includes('Close'))?.click())

  await signupPage.goto(BASE + '/auth/signin', { waitUntil: 'networkidle0' })
  await signupPage.type('#email', newEmail)
  await signupPage.type('#password', newPassword) // the self-chosen password must no longer work
  await signupPage.evaluate(() => [...document.querySelectorAll('button.action-btn')].find(b => b.innerText.includes('Sign in'))?.click())
  await new Promise(r => setTimeout(r, 1500))
  check('the self-chosen password no longer works after an admin reset', new URL(signupPage.url()).pathname === '/auth/signin', signupPage.url())

  await signupPage.goto(BASE + '/auth/signin', { waitUntil: 'networkidle0' })
  await signupPage.type('#email', newEmail)
  await signupPage.type('#password', adminResetPassword)
  await Promise.all([
    signupPage.waitForFunction(() => !location.pathname.startsWith('/auth/signin'), { timeout: 15000 }),
    signupPage.evaluate(() => [...document.querySelectorAll('button.action-btn')].find(b => b.innerText.includes('Sign in'))?.click()),
  ])
  const afterResetSession = await sessionOf(signupPage)
  check('the admin-reset password signs in', afterResetSession?.user?.email === newEmail, JSON.stringify(afterResetSession))

  const resetAudit = await db.query("SELECT detail FROM audit_log WHERE action = 'RESET_PASSWORD'")
  check('the reset is audited without ever storing the password itself', resetAudit.rows.length === 1
    && resetAudit.rows[0].detail?.email === newEmail && !JSON.stringify(resetAudit.rows[0].detail).includes(adminResetPassword),
    JSON.stringify(resetAudit.rows[0]))

  // ── Glossary: CSV import (semicolons, quotes, bad lines), duplicates, edit, search, document translation, audit ──
  const glossaryApi = (path, init) => adminPage.evaluate(async (p, i) => {
    const r = await fetch(p, i)
    return { status: r.status, json: await r.json().catch(() => null) }
  }, path, init)
  const jsonInit = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  const glossaryCreated = await glossaryApi('/api/admin/glossary', jsonInit('POST', { name: 'E2E glossary' }))
  const gid = glossaryCreated.json?.id
  check('an admin can create a glossary', glossaryCreated.status === 200 && Number.isInteger(gid), JSON.stringify(glossaryCreated))

  const csv = [
    'source;target;source_lang;target_lang;match_variants',
    '"Dupont, Jean";"Jean Dupont";en;fr;false',
    'contract;contrat;en;fr;true',
    ';missing source;en;fr',
    'bad;lang;xx;fr',
    'CONTRACT;doublon;en;fr',
  ].join('\r\n')
  const imported = await glossaryApi('/api/admin/glossary/' + gid + '/import', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: csv })
  check('a semicolon CSV with quoted commas imports; bad lines are reported, not silently dropped',
    imported.status === 200 && imported.json.imported === 2 && imported.json.duplicates === 1 && imported.json.rejectedCount === 2
      && JSON.stringify(imported.json.rejected.map(r => [r.line, r.reason])) === JSON.stringify([[4, 'missing_term'], [5, 'invalid_lang']]),
    JSON.stringify(imported))

  const found = await glossaryApi('/api/admin/glossary/' + gid + '/entries?q=dupont', { method: 'GET' })
  check('the term list is searchable and paginated', found.status === 200 && found.json.total === 1 && found.json.entries[0].source === 'Dupont, Jean', JSON.stringify(found))

  const dup = await glossaryApi('/api/admin/glossary/' + gid + '/entries', jsonInit('POST', { source: 'Contract', target: 'autre', sourceLang: 'en', targetLang: 'fr' }))
  check('adding a term that already exists is refused with the existing translation', dup.status === 409 && dup.json.code === 'duplicate' && dup.json.existingTarget === 'contrat', JSON.stringify(dup))

  const contractEntry = (await glossaryApi('/api/admin/glossary/' + gid + '/entries?q=contract', { method: 'GET' })).json.entries[0]
  const edited = await glossaryApi('/api/admin/glossary/' + gid + '/entries/' + contractEntry.id,
    jsonInit('PATCH', { source: 'contract', target: 'contrat de travail', sourceLang: 'en', targetLang: 'fr', matchVariants: true }))
  check('a term can be edited in place', edited.status === 200 && edited.json.target === 'contrat de travail' && edited.json.matchVariants === true, JSON.stringify(edited))

  // Document translation uses the glossary, with word-ending variants ("contracts" matches "contract")
  const translateWithGlossary = (withCodes) => adminPage.evaluate(async codes => {
    const form = new FormData()
    form.append('file', new File(['The contracts are signed'], 'doc.txt', { type: 'text/plain' }))
    form.append('targetLang', 'French')
    form.append('sourceLang', 'English')
    if (codes) { form.append('targetCode', 'fr'); form.append('sourceCode', 'en') }
    const r = await fetch('/api/translate/document', { method: 'POST', body: form })
    return r.status
  }, withCodes)
  aiCalls.length = 0
  const docStatus = await translateWithGlossary(true)
  check('the glossary is applied to document translation', docStatus === 200 && aiCalls.length === 1 && aiCalls[0].glossary === true, JSON.stringify(aiCalls))
  aiCalls.length = 0
  await translateWithGlossary(false)
  check('without language codes the document is still translated, just without the glossary', aiCalls.length === 1 && aiCalls[0].glossary === false, JSON.stringify(aiCalls))

  const glossaryAudit = (await adminPage.evaluate(() => fetch('/api/admin/audit').then(r => r.json()))).rows
  const glossaryActions = glossaryAudit.filter(r => r.resource === 'glossary:' + gid).map(r => r.action)
  check('glossary changes are audited and show the glossary name',
    ['CREATE_GLOSSARY', 'IMPORT_GLOSSARY_CSV', 'UPDATE_GLOSSARY_TERM'].every(a => glossaryActions.includes(a))
      && glossaryAudit.some(r => r.resource === 'glossary:' + gid && r.resource_label === 'glossary:E2E glossary'),
    JSON.stringify(glossaryActions))

  await glossaryApi('/api/admin/glossary/' + gid, { method: 'DELETE' })
  const gone = (await db.query('SELECT 1 FROM glossary_entries WHERE glossary_id = $1', [gid])).rowCount === 0
  check('deleting a glossary removes its terms', gone)

  // ── Feedback: a user reports a translation issue with an image, an admin reads, classifies and deletes it ──
  const feedbackProblems = []
  signupPage.on('pageerror', e => feedbackProblems.push('pageerror: ' + e.message.split('\n')[0]))
  const pngPath = join(tmpdir(), 'leksis-e2e-feedback.png')
  writeFileSync(pngPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'))

  await signupPage.goto(BASE + '/', { waitUntil: 'networkidle0' })
  // The header controls exist twice (mobile row hidden on desktop): click the visible one
  const clickVisible = (page, selector) => page.evaluate(sel =>
    [...document.querySelectorAll(sel)].find(el => el.offsetParent !== null).click(), selector)
  // The help window ends with a link to the feedback form
  await clickVisible(signupPage, 'button[aria-label="Help & Tips"]')
  await signupPage.waitForSelector('[role=dialog]', { timeout: 10000 })
  check('the help window offers to report a problem', await signupPage.evaluate(() =>
    [...document.querySelectorAll('[role=dialog] button')].some(b => b.innerText.includes('Report a problem'))))
  await signupPage.keyboard.press('Escape')
  // Header icon next to the help button
  await clickVisible(signupPage, 'button[aria-label="Report a problem or suggest an improvement"]')
  await signupPage.waitForSelector('[role=dialog] textarea', { timeout: 10000 })
  await signupPage.evaluate(() => [...document.querySelectorAll('[role=dialog] [role=radio]')].find(b => b.innerText.includes('Translation')).click())
  await signupPage.type('[role=dialog] textarea', 'The term "contract" should be "contrat de travail"')
  const fileInput = await signupPage.$('[role=dialog] input[type=file]')
  await fileInput.uploadFile(pngPath)
  await signupPage.waitForFunction(() => document.querySelectorAll('[role=dialog] img').length === 1, { timeout: 10000 })
  await Promise.all([
    signupPage.waitForFunction(() => document.body.innerText.includes('Your message has been sent'), { timeout: 10000 }),
    signupPage.evaluate(() => [...document.querySelectorAll('[role=dialog] button.action-btn')].find(b => b.innerText.includes('Send')).click()),
  ])
  const fb = (await db.query("SELECT id, user_email, category, message, context, status FROM feedback")).rows
  const fbAtt = fb[0] ? (await db.query('SELECT mime, data FROM feedback_attachments WHERE feedback_id = $1', [fb[0].id])).rows : []
  check('a user can send feedback with an image from the account menu',
    fb.length === 1 && fb[0].user_email === newEmail && fb[0].category === 'translation' && fb[0].status === 'new'
      && fb[0].context?.tab === 'text' && fb[0].context?.appVersion && fbAtt.length === 1 && fbAtt[0].mime === 'image/png'
      && Buffer.from(fbAtt[0].data).subarray(1, 4).toString() === 'PNG',
    JSON.stringify(fb[0]))

  const svgUpload = await signupPage.evaluate(async () => {
    const form = new FormData()
    form.append('category', 'problem')
    form.append('message', 'svg')
    form.append('includeContext', 'false')
    form.append('images', new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], 'x.png', { type: 'image/png' }))
    const r = await fetch('/api/feedback', { method: 'POST', body: form })
    return { status: r.status, code: (await r.json()).code }
  })
  check('an SVG disguised as a PNG is refused', svgUpload.status === 400 && svgUpload.code === 'unsupported_format', JSON.stringify(svgUpload))

  const userReadsAdmin = await signupPage.evaluate(id => fetch('/api/admin/feedback/' + id).then(r => r.status), fb[0]?.id)
  check('a user cannot read the feedback inbox', userReadsAdmin === 403 || userReadsAdmin === 404, String(userReadsAdmin))

  await adminPage.goto(BASE + '/admin/feedback', { waitUntil: 'networkidle0' })
  await adminPage.waitForFunction(() => document.body.innerText.includes('contrat de travail'), { timeout: 10000 })
  check('the admin sidebar shows one new feedback message',
    await adminPage.evaluate(() => [...document.querySelectorAll('nav a')].find(a => a.getAttribute('href') === '/admin/feedback')?.innerText.includes('1')))
  await adminPage.evaluate(() => [...document.querySelectorAll('li button')].find(b => b.innerText.includes('contrat de travail')).click())
  await adminPage.waitForFunction(() => document.querySelectorAll('img[src^="/api/admin/feedback/attachments/"]').length === 1, { timeout: 10000 })
  const imgStatus = await adminPage.evaluate(() => fetch(document.querySelector('img[src^="/api/admin/feedback/attachments/"]').getAttribute('src'))
    .then(r => [r.status, r.headers.get('content-type'), r.headers.get('content-security-policy')]))
  check('the admin sees the attached image, served sandboxed', imgStatus[0] === 200 && imgStatus[1] === 'image/png' && /sandbox/.test(imgStatus[2]), JSON.stringify(imgStatus))

  await adminPage.select('select[aria-label=Status]', 'done')
  await adminPage.waitForFunction(() => document.body.innerText.includes('Message updated'), { timeout: 10000 })
  check('the admin can mark the message as done', (await db.query('SELECT status FROM feedback WHERE id = $1', [fb[0].id])).rows[0]?.status === 'done')
  const fbAudit = (await adminPage.evaluate(() => fetch('/api/admin/audit').then(r => r.json()))).rows.find(r => r.action === 'UPDATE_FEEDBACK')
  check('the status change is audited and shows the author', fbAudit?.resource_label === 'feedback:' + newEmail && fbAudit?.detail?.after === 'done', JSON.stringify(fbAudit))

  const fbDeleted = await glossaryApi('/api/admin/feedback/' + fb[0].id, { method: 'DELETE' })
  check('deleting a feedback message removes its images', fbDeleted.status === 200
    && (await db.query('SELECT 1 FROM feedback_attachments')).rows.length === 0, JSON.stringify(fbDeleted))

  await glossaryApi('/api/admin/settings', jsonInit('PATCH', { key: 'features', value: { feedback: false } }))
  await new Promise(r => setTimeout(r, 5500)) // settings cache (5 s)
  const disabledSend = await signupPage.evaluate(async () => {
    const form = new FormData()
    form.append('category', 'other'); form.append('message', 'x'); form.append('includeContext', 'false')
    const r = await fetch('/api/feedback', { method: 'POST', body: form })
    return { status: r.status, code: (await r.json()).code }
  })
  check('feedback can be switched off by the admin', disabledSend.status === 403 && disabledSend.code === 'disabled', JSON.stringify(disabledSend))
  await glossaryApi('/api/admin/settings', jsonInit('PATCH', { key: 'features', value: { feedback: true } }))
  check('no uncaught exceptions while sending feedback', feedbackProblems.length === 0, feedbackProblems.join(' | '))

  check('no browser console errors on the admin pages', adminProblems.length === 0, adminProblems.join(' | '))

  check('no browser console errors or uncaught exceptions (e.g. hydration #418)', problems.length === 0, problems.join(' | '))
} catch (err) {
  failures++
  console.log('FAIL unexpected error:', err instanceof Error ? err.message : err)
} finally {
  await browser?.close().catch(() => {})
  app.kill()
  await dbServer.stop().catch(() => {})
  await db.close().catch(() => {})
  aiServer.close()
}

if (failures) console.log(`\n${failures} check(s) failed\n--- server log ---\n${appLog.split('\n').slice(-30).join('\n')}`)
else console.log('\nAll checks passed')
process.exit(failures ? 1 : 0)
