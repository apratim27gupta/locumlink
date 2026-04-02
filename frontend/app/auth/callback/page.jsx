'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [message, setMessage] = useState('Finishing login...')

  useEffect(() => {
    let mounted = true

    ;(async () => {
      try {
        // Supabase sends the user back to this URL after the OTP verification step.
        // With `detectSessionInUrl: true`, the session should be picked up automatically.
        await supabase.auth.getSession()
        if (!mounted) return
        setMessage('Login complete. Redirecting...')
        router.push('/dashboard')
      } catch (err) {
        if (!mounted) return
        setMessage('Login callback failed. Check the console/network and Supabase Auth logs.')
        // eslint-disable-next-line no-console
        console.error('Auth callback error:', err)
      }
    })()

    return () => {
      mounted = false
    }
  }, [router])

  return <main style={{ padding: 24 }}>{message}</main>
}

