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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('email_digest_enabled, email_digest_radius_km')
        .eq('id', userId)
        .single()
      if (data) {
        setEnabled(data.email_digest_enabled ?? true)
        setRadius(data.email_digest_radius_km ?? 25)
      }
      setLoading(false)
    }
    load()
  }, [userId])

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
        style={{ maxWidth: 390, background: '#162814', border: '0.5px solid rgba(200,145,58,0.15)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <button onClick={onClose} className="flex items-center gap-1.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C8913A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
            </svg>
            <span className="text-[12px]" style={{ color: 'rgba(232,242,224,0.4)' }}>Back</span>
          </button>
          <h2 className="font-heading text-[18px] font-light" style={{ color: '#E8F2E0' }}>Settings</h2>
          <div className="w-[50px]" />
        </div>

        {/* Digest toggle */}
        <div className="rounded-[12px] px-4 py-3 mb-3" style={{ background: 'rgba(232,242,224,0.04)', border: '0.5px solid rgba(232,242,224,0.06)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] font-medium" style={{ color: '#E8F2E0' }}>Weekly quest digest</p>
              <p className="text-[12px] mt-0.5" style={{ color: 'rgba(232,242,224,0.4)' }}>
                Get an email every Monday with quests near you
              </p>
            </div>
            <button
              onClick={() => toggle(!enabled)}
              className="w-10 h-[22px] rounded-full relative shrink-0 transition-colors"
              style={{ background: enabled ? '#C8913A' : 'rgba(232,242,224,0.12)' }}
            >
              <div
                className="w-[18px] h-[18px] rounded-full absolute top-[2px] transition-all"
                style={{
                  background: '#E8F2E0',
                  left: enabled ? 20 : 2,
                }}
              />
            </button>
          </div>

          {enabled && (
            <div className="mt-3 pt-3" style={{ borderTop: '0.5px solid rgba(232,242,224,0.06)' }}>
              <p className="text-[12px] mb-2" style={{ color: 'rgba(232,242,224,0.4)' }}>Digest radius</p>
              <div className="flex gap-2">
                {RADIUS_OPTIONS.map(km => (
                  <button
                    key={km}
                    onClick={() => changeRadius(km)}
                    className="px-3 py-1 rounded-full text-[13px] font-medium transition-colors"
                    style={{
                      background: radius === km ? 'rgba(200,145,58,0.2)' : 'rgba(232,242,224,0.06)',
                      color: radius === km ? '#C8913A' : 'rgba(232,242,224,0.4)',
                      border: radius === km ? '1px solid rgba(200,145,58,0.3)' : '1px solid transparent',
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
          <p className="text-[13px] text-center mt-1" style={{ color: 'rgba(200,145,58,0.5)' }}>Saving...</p>
        )}
      </div>
    </div>
  )
}
