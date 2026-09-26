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
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
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
const dbServer = new PGLiteSocketServer({ db, port: DB_PORT, host: '127.0.0.1', maxConnections: 10 })
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
    if (req.url !== '/api/generate') { res.statusCode = 404; return res.end('{}') }
    const { prompt } = JSON.parse(body)
    const joined = prompt.split('\n\n').pop()
    const parts = joined.split(' ||| ')
    aiCalls.push({ segments: parts.length, chars: joined.length })
    const weak = joined.includes('MERGE') && parts.length > 2
    res.end(JSON.stringify({ response: (weak ? parts.join(' ') : joined).toUpperCase(), done: true }))
  })
})
await new Promise(resolve => aiServer.listen(AI_PORT, '127.0.0.1', resolve))

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

  // ── Upload refused: the server sends a code, not text to display ──
  const badLogo = await adminPage.evaluate(async () => {
    const form = new FormData()
    form.append('logo', new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], 'logo.svg', { type: 'image/svg+xml' }))
    const r = await fetch('/api/admin/logo', { method: 'POST', body: form })
    return { status: r.status, json: await r.json() }
  })
  check('an SVG logo is refused with a translatable error code', badLogo.status === 400 && badLogo.json.code === 'unsupported_format' && badLogo.json.formats?.includes('PNG'), JSON.stringify(badLogo))

  // ── Reset to defaults ──────────────────────────────────────────
  const reset = await adminPage.evaluate(() => fetch('/api/admin/settings/reset', { method: 'POST' }).then(r => r.status))
  check('an admin can reset the settings to their defaults', reset === 200, String(reset))
  const stored = Object.fromEntries((await db.query('SELECT key, value FROM site_settings')).rows.map(r => [r.key, r.value]))
  check('every setting was written with its default', stored.branding?.siteName === 'Leksis' && stored.general?.usageRetentionDays === 365
    && stored.features?.limits?.maxDocChars === 12000 && stored.features?.limits?.maxImageMB === 10 && stored.rewrite_tones?.length === 6, JSON.stringify(Object.keys(stored)))

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
    const b = [...document.querySelectorAll('button.action-btn')].find(x => x.innerText.includes('Save'))
    return b ? { found: true, disabled: b.disabled } : { found: false }
  })
  const sb = await saveButton()
  check('the Save button is usable for an Ollama server (num_ctx accepted)', sb.found && sb.disabled === false, JSON.stringify(sb))
  await adminPage.evaluate(() => [...document.querySelectorAll('button.action-btn')].find(x => x.innerText.includes('Save')).click())
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
