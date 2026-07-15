'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface DigestSettingsProps {
  userId: string
  onClose: () => void
}

const RADIUS_OPTIONS = [2, 10, 25, 50]

export default function DigestSettings({ userId, onClose }: DigestSettingsProps) {
  const [enabled, setEnabled] = useState(true)
  const [radius, setRadius] = useState(25)
  const [firstName, setFirstName] = useState('')
  const [initialFirstName, setInitialFirstName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('email_digest_enabled, email_digest_radius_km, first_name')
        .eq('id', userId)
        .single()
      if (data) {
        setEnabled(data.email_digest_enabled ?? true)
        setRadius(data.email_digest_radius_km ?? 25)
        setFirstName(data.first_name ?? '')
        setInitialFirstName(data.first_name ?? '')
      }
      setLoading(false)
    }
    load()
  }, [userId])

  async function saveName() {
    const trimmed = firstName.trim()
    if (!trimmed || trimmed === initialFirstName) return
    setSaving(true)
    setNameSaved(false)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ first_name: trimmed })
        .eq('id', userId)
      if (!error) {
        setInitialFirstName(trimmed)
        setNameSaved(true)
        // useAuth caches the profile and only refetches on auth state change,
        // so the menu/header still shows the old name. A short reload lets
        // every consumer pick up the new name without threading a refresh
        // callback through every prop.
        setTimeout(() => { window.location.reload() }, 600)
      }
    } catch (err) {
      console.error('Failed to update name:', err)
    }
    setSaving(false)
  }

  async function toggle(val: boolean) {
    setEnabled(val)
    setSaving(true)
    try {
      await supabase.from('profiles').update({ email_digest_enabled: val }).eq('id', userId)
    } catch (err) {
      console.error('Failed to update digest enabled:', err)
    }
    setSaving(false)
  }

  async function changeRadius(km: number) {
    setRadius(km)
    setSaving(true)
    try {
      await supabase.from('profiles').update({ email_digest_radius_km: km }).eq('id', userId)
    } catch (err) {
      console.error('Failed to update digest radius:', err)
    }
    setSaving(false)
  }

  if (loading) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        className="w-full rounded-t-[20px] px-5 pt-5 pb-8"
        style={{ maxWidth: 390, background: 'var(--color-card)', border: '0.5px solid var(--color-text-faint)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <button onClick={onClose} className="flex items-center gap-1.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
            </svg>
            <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Back</span>
          </button>
          <h2 className="font-heading text-[18px] font-light" style={{ color: 'var(--color-text)' }}>Settings</h2>
          <div className="w-[50px]" />
        </div>

        {/* Name */}
        <div className="rounded-[12px] px-4 py-3 mb-3" style={{ background: 'var(--color-pill-bg)', border: '0.5px solid var(--color-pill-bg)' }}>
          <p className="text-[12px] font-medium mb-2" style={{ color: 'var(--color-text)' }}>Your name</p>
          <div className="flex gap-2">
            <input
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveName() } }}
              maxLength={40}
              placeholder="e.g. Pedro"
              className="flex-1 rounded-lg px-3 py-2 text-[13px]"
              style={{
                background: 'var(--color-card)',
                border: '0.5px solid var(--color-text-faint)',
                color: 'var(--color-text)',
                outline: 'none',
              }}
            />
            <button
              onClick={saveName}
              disabled={!firstName.trim() || firstName.trim() === initialFirstName || saving}
              className="rounded-lg px-4 text-[12px] font-medium"
              style={{
                background: 'var(--color-amber)',
                color: 'var(--color-pill-active-text)',
                border: 'none',
                cursor: (!firstName.trim() || firstName.trim() === initialFirstName || saving) ? 'default' : 'pointer',
                opacity: (!firstName.trim() || firstName.trim() === initialFirstName || saving) ? 0.5 : 1,
              }}
            >
              {nameSaved ? 'Saved' : 'Save'}
            </button>
          </div>
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            Shown on your menu and in the weekly digest greeting.
          </p>
        </div>

        {/* Digest toggle */}
        <div className="rounded-[12px] px-4 py-3 mb-3" style={{ background: 'var(--color-pill-bg)', border: '0.5px solid var(--color-pill-bg)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>Weekly event digest</p>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                Get an email every Monday with events near you
              </p>
            </div>
            <button
              onClick={() => toggle(!enabled)}
              className="w-10 h-[22px] rounded-full relative shrink-0 transition-colors"
              style={{ background: enabled ? 'var(--color-amber)' : 'var(--color-text-faint)' }}
            >
              <div
                className="w-[18px] h-[18px] rounded-full absolute top-[2px] transition-all"
                style={{
                  background: 'var(--color-text)',
                  left: enabled ? 20 : 2,
                }}
              />
            </button>
          </div>

          {enabled && (
            <div className="mt-3 pt-3" style={{ borderTop: '0.5px solid var(--color-pill-bg)' }}>
              <p className="text-[12px] mb-2" style={{ color: 'var(--color-text-secondary)' }}>Digest radius</p>
              <div className="flex gap-2">
                {RADIUS_OPTIONS.map(km => (
                  <button
                    key={km}
                    onClick={() => changeRadius(km)}
                    className="px-3 py-1 rounded-full text-[13px] font-medium transition-colors"
                    style={{
                      background: radius === km ? 'var(--color-amber-border)' : 'var(--color-pill-bg)',
                      color: radius === km ? 'var(--color-amber)' : 'var(--color-text-secondary)',
                      border: radius === km ? '1px solid var(--color-amber-border)' : '1px solid transparent',
                    }}
                  >
                    {km}km
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {saving && (
          <p className="text-[13px] text-center mt-1" style={{ color: 'var(--color-text-secondary)' }}>Saving...</p>
        )}
      </div>
    </div>
  )
}
