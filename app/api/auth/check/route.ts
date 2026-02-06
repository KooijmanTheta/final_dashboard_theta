import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()
  const auth = cookieStore.get('site_auth')
  const user = cookieStore.get('site_user')

  if (auth?.value === 'authenticated') {
    return NextResponse.json({
      authenticated: true,
      username: user?.value || 'unknown'
    })
  }

  return NextResponse.json({ authenticated: false }, { status: 401 })
}
