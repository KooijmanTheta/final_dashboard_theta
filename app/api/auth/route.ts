import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// Users are defined as USERNAME:PASSWORD pairs in env var
// Format: "lucas:password123,john:pass456,admin:adminpass"
// Fallback to a default if not set
const USERS_CONFIG = process.env.SITE_USERS || 'admin:theta2024'

// Parse users from config
function getUsers(): Map<string, string> {
  const users = new Map<string, string>()
  const pairs = USERS_CONFIG.split(',')
  for (const pair of pairs) {
    const [username, password] = pair.trim().split(':')
    if (username && password) {
      users.set(username.toLowerCase(), password)
    }
  }
  return users
}

export async function POST(request: Request) {
  const { username, password } = await request.json()

  if (!username || !password) {
    return NextResponse.json({ success: false, error: 'Username and password required' }, { status: 400 })
  }

  const users = getUsers()
  const storedPassword = users.get(username.toLowerCase())

  if (storedPassword && storedPassword === password) {
    const cookieStore = await cookies()

    // Store auth status
    cookieStore.set('site_auth', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })

    // Store username separately
    cookieStore.set('site_user', username.toLowerCase(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })

    return NextResponse.json({ success: true, username: username.toLowerCase() })
  }

  return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 })
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete('site_auth')
  cookieStore.delete('site_user')
  return NextResponse.json({ success: true })
}
