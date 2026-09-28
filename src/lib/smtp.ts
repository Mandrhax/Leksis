import 'server-only'
import nodemailer from 'nodemailer'
import { getSetting } from '@/lib/settings'
import { decrypt } from '@/lib/crypto'

export interface SmtpConfig {
  host:         string
  port:         number
  secure:       boolean
  user:         string
  /** Chiffré en base (AES-256-GCM) — jamais renvoyé au client */
  passEnc:      string
  fromAddress:  string
  fromName:     string
}

export interface SmtpPublicConfig {
  host:         string
  port:         number
  secure:       boolean
  user:         string
  hasPassword:  boolean
  fromAddress:  string
  fromName:     string
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : fallback)

/** Configuration SMTP effective, lue en base. À appeler côté serveur uniquement. */
export async function getSmtpConfig(): Promise<SmtpConfig> {
  const raw = await getSetting<Record<string, unknown>>('smtp_config')
  return {
    host:        str(raw.host),
    port:        num(raw.port, 587),
    secure:      raw.secure === true,
    user:        str(raw.user),
    passEnc:     str(raw.passEnc),
    fromAddress: str(raw.fromAddress),
    fromName:    str(raw.fromName),
  }
}

/** Configuration renvoyée à l'admin (Réglages → General) — sans le mot de passe. */
export async function getSmtpPublicConfig(): Promise<SmtpPublicConfig> {
  const raw = await getSetting<Record<string, unknown>>('smtp_config')
  return {
    host:        str(raw.host),
    port:        num(raw.port, 587),
    secure:      raw.secure === true,
    user:        str(raw.user),
    hasPassword: str(raw.passEnc) !== '',
    fromAddress: str(raw.fromAddress),
    fromName:    str(raw.fromName),
  }
}

/** Un relais SMTP est utilisable dès qu'un serveur et une adresse d'expédition sont renseignés. */
export function isSmtpConfigured(cfg: Pick<SmtpConfig, 'host' | 'fromAddress'>): boolean {
  return cfg.host !== '' && cfg.fromAddress !== ''
}

function createTransport(cfg: SmtpConfig) {
  let password = ''
  if (cfg.passEnc) {
    try { password = decrypt(cfg.passEnc) } catch { password = '' }
  }
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: password } : undefined,
    connectionTimeout: 8000,
    socketTimeout: 8000,
  })
}

function fromHeader(cfg: SmtpConfig): string {
  return cfg.fromName ? `"${cfg.fromName.replace(/"/g, '')}" <${cfg.fromAddress}>` : cfg.fromAddress
}

/** Envoie un message texte brut via le relais configuré. Lève une erreur si l'envoi échoue. */
export async function sendMail(cfg: SmtpConfig, opts: { to: string; subject: string; text: string }): Promise<void> {
  const transport = createTransport(cfg)
  await transport.sendMail({ from: fromHeader(cfg), to: opts.to, subject: opts.subject, text: opts.text })
}

/** Envoie le code de connexion par email. */
export async function sendOtpEmail(cfg: SmtpConfig, opts: { to: string; code: string; siteName: string }): Promise<void> {
  await sendMail(cfg, {
    to: opts.to,
    subject: `${opts.siteName} — Your sign-in code`,
    text: `Your sign-in code for ${opts.siteName} is: ${opts.code}\n\nThis code is valid for 10 minutes. If you did not request it, you can ignore this email.`,
  })
}

/** Vérifie la connexion et l'authentification SMTP sans envoyer de message. */
export async function verifySmtpConnection(cfg: SmtpConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await createTransport(cfg).verify()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
