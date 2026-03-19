'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  onSignIn: (email: string, password: string) => Promise<any>
  onSignUp: (email: string, password: string, firstName: string) => Promise<any>
}

function SeedlingIcon({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="22" r="10" fill="rgba(200,145,58,0.15)" stroke="rgba(200,145,58,0.3)" strokeWidth="0.8" />
      <path d="M18 22 Q14 16 13 10 Q16 14 18 12 Q20 14 23 10 Q22 16 18 22Z" fill="#C8913A" opacity="0.9" />
      <path d="M18 22 L18 30" stroke="rgba(200,145,58,0.5)" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="18" cy="22" r="2" fill="#C8913A" />
    </svg>
  )
}

export default function AuthScreen({ onSignIn, onSignUp }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmMessage, setConfirmMessage] = useState('')
  const [showForgot, setShowForgot] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setConfirmMessage('')
    setSubmitting(true)

    try {
      if (mode === 'signup') {
        if (!firstName.trim()) {
          setError('First name is required')
          setSubmitting(false)
          return
        }
        const data = await onSignUp(email, password, firstName.trim())
        // If no session returned, email confirmation is required
        if (data.user && !data.session) {
          setConfirmMessage('Check your email to confirm your account.')
        }
      } else {
        await onSignIn(email, password)
      }
    } catch (err: any) {
      const msg = err.message ?? 'Something went wrong'
      // Friendly error messages
      if (msg.includes('Invalid login credentials')) {
        setError('Wrong email or password.')
      } else if (msg.includes('already registered') || msg.includes('already been registered')) {
        setError('This email is already registered. Try logging in.')
      } else if (msg.includes('Password should be')) {
        setError('Password must be at least 6 characters.')
      } else if (msg.includes('valid email')) {
        setError('Please enter a valid email address.')
      } else {
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 10,
    border: '0.5px solid rgba(200,145,58,0.2)',
    background: '#162814',
    color: '#E8F2E0',
    fontSize: 14,
    fontFamily: 'var(--font-outfit), sans-serif',
    outline: 'none',
    transition: 'border-color 0.15s',
  }

  return (
    <div
      className="min-h-screen flex justify-center font-body"
      style={{ background: '#0D1A0B', color: '#E8F2E0' }}
    >
      <div className="w-full flex flex-col items-center px-6 pt-16" style={{ maxWidth: 390 }}>

        {/* Hero with glow */}
        <div className="relative mb-10">
          <div
            className="absolute pointer-events-none"
            style={{
              top: -40,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 280,
              height: 280,
              background: 'radial-gradient(circle, rgba(200,145,58,0.14) 0%, transparent 70%)',
            }}
          />
          <div className="flex items-center gap-2.5 relative z-10">
            <SeedlingIcon />
            <span
              className="font-heading text-[36px] font-light tracking-tight leading-none"
              style={{ color: '#E8F2E0', letterSpacing: '-0.01em' }}
            >
              em<span style={{ color: '#C8913A' }}>e</span>rge
            </span>
          </div>
          <p
            className="text-center mt-2.5 relative z-10"
            style={{
              fontSize: 10,
              color: 'rgba(232,242,224,0.4)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            Real quests · Real community · Real change
          </p>
        </div>

        {/* Mode toggle */}
        <div
          className="flex rounded-full p-0.5 mb-6 w-full"
          style={{ background: '#162814', maxWidth: 260 }}
        >
          {(['login', 'signup'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); setConfirmMessage('') }}
              className="flex-1 py-2 rounded-full text-[12px] font-medium transition-all"
              style={{
                background: mode === m ? '#C8913A' : 'transparent',
                color: mode === m ? '#0D1A0B' : 'rgba(232,242,224,0.5)',
                letterSpacing: '0.04em',
              }}
            >
              {m === 'login' ? 'Log in' : 'Sign up'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="w-full space-y-3" style={{ maxWidth: 320 }}>
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'rgba(200,145,58,0.6)'}
              onBlur={e => e.target.style.borderColor = 'rgba(200,145,58,0.2)'}
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = 'rgba(200,145,58,0.6)'}
            onBlur={e => e.target.style.borderColor = 'rgba(200,145,58,0.2)'}
          />

          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              style={{ ...inputStyle, paddingRight: 44 }}
              onFocus={e => e.target.style.borderColor = 'rgba(200,145,58,0.6)'}
              onBlur={e => e.target.style.borderColor = 'rgba(200,145,58,0.2)'}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(200,145,58,0.5)', fontSize: 13, padding: 4,
                fontFamily: 'var(--font-outfit), sans-serif',
              }}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <p className="text-[12px] px-1" style={{ color: '#D4785A' }}>
              {error}
            </p>
          )}

          {/* Confirm message */}
          {confirmMessage && (
            <p className="text-[12px] px-1" style={{ color: '#C8913A' }}>
              {confirmMessage}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-[10px] text-[13px] font-semibold transition-opacity"
            style={{
              background: '#C8913A',
              color: '#0D1A0B',
              opacity: submitting ? 0.6 : 1,
              letterSpacing: '0.02em',
              marginTop: 8,
            }}
          >
            {submitting
              ? (mode === 'login' ? 'Logging in...' : 'Creating account...')
              : (mode === 'login' ? 'Log in' : 'Create account')
            }
          </button>
          {/* Forgot password */}
          {mode === 'login' && !showForgot && (
            <button
              type="button"
              onClick={() => setShowForgot(true)}
              className="w-full text-center text-[11px] mt-2"
              style={{ color: 'rgba(200,145,58,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Forgot password?
            </button>
          )}
        </form>

        {/* Forgot password form */}
        {showForgot && (
          <div className="mt-4 rounded-[12px] px-4 py-4" style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.2)' }}>
            {forgotSent ? (
              <div className="text-center">
                <p className="text-[13px] font-medium" style={{ color: '#C8913A' }}>Check your email</p>
                <p className="text-[11px] mt-1" style={{ color: 'rgba(232,242,224,0.45)' }}>
                  We sent a password reset link to {email || 'your email'}.
                </p>
                <button
                  onClick={() => { setShowForgot(false); setForgotSent(false) }}
                  className="text-[11px] mt-3 underline"
                  style={{ color: '#C8913A', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Back to login
                </button>
              </div>
            ) : (
              <>
                <p className="text-[12px] mb-3" style={{ color: 'rgba(232,242,224,0.55)' }}>
                  Enter your email and we&apos;ll send you a reset link.
                </p>
                <input
                  type="email"
                  placeholder="Your email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={inputStyle}
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setShowForgot(false)}
                    className="flex-1 py-2.5 rounded-[8px] text-[11px]"
                    style={{ background: 'rgba(232,242,224,0.06)', color: 'rgba(232,242,224,0.4)', border: 'none', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!email) { setError('Enter your email first'); return }
                      setSubmitting(true)
                      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
                        redirectTo: window.location.origin,
                      })
                      setSubmitting(false)
                      if (resetErr) { setError(resetErr.message) }
                      else { setForgotSent(true); setError('') }
                    }}
                    disabled={submitting}
                    className="flex-1 py-2.5 rounded-[8px] text-[11px] font-semibold"
                    style={{ background: '#C8913A', color: '#0D1A0B', border: 'none', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}
                  >
                    {submitting ? 'Sending...' : 'Send reset link'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <p
          className="mt-8 text-[11px] text-center leading-relaxed"
          style={{ color: 'rgba(232,242,224,0.25)' }}
        >
          {mode === 'login'
            ? "Don\u2019t have an account? "
            : 'Already have an account? '
          }
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setConfirmMessage('') }}
            className="underline"
            style={{ color: '#C8913A' }}
          >
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </button>
        </p>

        {/* Legal + credit */}
        <p className="mt-10 text-[8px] text-center leading-[1.7] px-2" style={{ color: 'rgba(232,242,224,0.18)' }}>
          By signing up you agree that Emerge is a community platform. We aggregate publicly available events and do not organise or endorse them. Attend at your own risk. Your data is stored securely and never shared.
        </p>
        <p className="mt-2 text-[8px] text-center" style={{ color: 'rgba(232,242,224,0.15)' }}>
          Created by Pedro Valdjiu · <a href="https://terralta.org" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(200,145,58,0.35)', textDecoration: 'underline' }}>terralta.org</a>
        </p>
      </div>
    </div>
  )
}
