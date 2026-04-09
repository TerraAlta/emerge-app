'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function ResetPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()

  // Exchange the recovery token for a session on the client
  useEffect(() => {
    async function verifyToken() {
      const tokenHash = searchParams.get('token_hash')
      const type = searchParams.get('type')

      if (tokenHash && type === 'recovery') {
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        })
        if (verifyErr) {
          setError('This reset link has expired or is invalid. Please request a new one.')
          setVerifying(false)
          return
        }
        setSessionReady(true)
        setVerifying(false)
        // Clean URL
        window.history.replaceState({}, '', '/reset-password')
        return
      }

      // No token — check if we already have a session (e.g. from hash fragment)
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        setSessionReady(true)
      } else {
        setError('No active reset session. Please request a new password reset link.')
      }
      setVerifying(false)
    }
    verifyToken()
  }, [searchParams])

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setSubmitting(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (updateErr) {
      if (updateErr.message.includes('session')) {
        setError('Reset session expired. Please request a new password reset link.')
      } else {
        setError(updateErr.message)
      }
    } else {
      setSuccess(true)
      setTimeout(() => router.push('/'), 2000)
    }
  }

  const inputStyle = {
    background: 'rgba(232,242,224,0.08)',
    border: '0.5px solid rgba(232,242,224,0.15)',
    color: '#E8F2E0',
    outline: 'none',
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#0D1A0B' }}
    >
      <div
        className="w-full max-w-[340px] rounded-2xl p-6"
        style={{
          background: '#162814',
          border: '0.5px solid rgba(200,145,58,0.3)',
        }}
      >
        <h1
          className="text-xl font-light italic text-center mb-1"
          style={{ color: '#C8913A', fontFamily: 'Fraunces, serif' }}
        >
          Set new password
        </h1>
        <p
          className="text-center text-[12px] mb-6"
          style={{ color: 'rgba(232,242,224,0.5)' }}
        >
          Choose a new password for your account
        </p>

        {verifying ? (
          <p className="text-center text-[12px]" style={{ color: 'rgba(232,242,224,0.4)' }}>
            Verifying reset link...
          </p>
        ) : success ? (
          <div className="text-center">
            <p className="text-[13px] font-medium" style={{ color: '#C8913A' }}>
              Password updated
            </p>
            <p className="text-[11px] mt-2" style={{ color: 'rgba(232,242,224,0.45)' }}>
              Redirecting you to Emerge...
            </p>
          </div>
        ) : !sessionReady ? (
          <div className="text-center">
            <p className="text-[12px] mb-4" style={{ color: '#E57373' }}>{error}</p>
            <button
              onClick={() => router.push('/')}
              className="text-[12px] underline"
              style={{ color: '#C8913A', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Back to login
            </button>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-[13px]"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px]"
                style={{ color: 'rgba(232,242,224,0.4)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-[13px]"
              style={inputStyle}
            />

            {error && (
              <p className="text-[11px] text-center" style={{ color: '#E57373' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-full text-[13px] font-semibold"
              style={{
                background: '#C8913A',
                color: '#0D1A0B',
                border: 'none',
                cursor: 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? 'Updating...' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0D1A0B' }}>
        <p className="text-[12px]" style={{ color: 'rgba(232,242,224,0.4)' }}>Loading...</p>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
