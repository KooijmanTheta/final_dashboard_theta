"use client"

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (pathname === '/login') {
      setIsAuthed(true)
      return
    }

    fetch('/api/auth/check')
      .then(res => {
        if (res.ok) {
          setIsAuthed(true)
        } else {
          router.push('/login')
        }
      })
      .catch(() => router.push('/login'))
  }, [pathname, router])

  if (isAuthed === null) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  return <>{children}</>
}
