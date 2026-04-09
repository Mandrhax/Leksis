import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateUser, generateOtp } from '@/lib/otp'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null

  if (!email) {
    return NextResponse.json({ error: 'Email requis' }, { status: 400 })
  }

  try {
    await getOrCreateUser(email)
    const code = await generateOtp(email)
    return NextResponse.json({ code })
  } catch (err) {
    console.error('[OTP] DB error:', err)
    return NextResponse.json({ error: 'Service indisponible. Vérifiez la connexion à la base de données.' }, { status: 503 })
  }
}
