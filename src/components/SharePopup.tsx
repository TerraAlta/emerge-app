'use client'

import { useState, useEffect, useRef } from 'react'

interface SharePopupProps {
  questId: string
  questTitle: string
  questDate: string
  questLocation: string
  onClose: () => void
}

export default function SharePopup({ questId, questTitle, questDate, questLocation, onClose }: SharePopupProps) {
  const [copied, setCopied] = useState(false)
  const [fadeIn, setFadeIn] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const shareUrl = `https://emerge.terralta.org/?quest=${questId}`
  const shareText = `Join me for ${questTitle} on ${questDate} \u2014 ${questLocation}. Discover regenerative quests on Emerge.`

  useEffect(() => {
    requestAnimationFrame(() => setFadeIn(true))
  }, [])

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea')
      ta.value = shareUrl
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  function handleWhatsApp() {
    const url = `https://wa.me/?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`
    window.open(url, '_blank', 'noopener')
  }

  function handleTelegram() {
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`
    window.open(url, '_blank', 'noopener')
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      style={{
        background: fadeIn ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
        transition: 'background 150ms ease',
      }}
    >
      <div
        ref={ref}
        className="w-full rounded-t-[16px] px-5 pt-5 pb-8 font-body"
        style={{
          maxWidth: 390,
          background: '#162814',
          border: '0.5px solid rgba(200,145,58,0.15)',
          borderBottom: 'none',
          transform: fadeIn ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 200ms ease-out',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-[13px] font-medium" style={{ color: '#E8F2E0' }}>Share quest</p>
          <button onClick={onClose} className="p-1 -mr-1 opacity-40 hover:opacity-70 transition-opacity">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E8F2E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Buttons row */}
        <div className="flex gap-3">
          {/* Copy link */}
          <button
            onClick={handleCopy}
            className="flex-1 flex flex-col items-center gap-2 py-3.5 rounded-[12px] transition-all"
            style={{
              background: copied ? 'rgba(200,145,58,0.15)' : 'rgba(232,242,224,0.05)',
              border: `0.5px solid ${copied ? 'rgba(200,145,58,0.3)' : 'rgba(232,242,224,0.08)'}`,
            }}
          >
            {copied ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C8913A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(232,242,224,0.55)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            )}
            <span
              className="text-[11px] font-medium transition-colors"
              style={{ color: copied ? '#C8913A' : 'rgba(232,242,224,0.55)' }}
            >
              {copied ? 'Copied!' : 'Copy link'}
            </span>
          </button>

          {/* WhatsApp */}
          <button
            onClick={handleWhatsApp}
            className="flex-1 flex flex-col items-center gap-2 py-3.5 rounded-[12px] transition-all"
            style={{
              background: 'rgba(232,242,224,0.05)',
              border: '0.5px solid rgba(232,242,224,0.08)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(232,242,224,0.55)">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <span className="text-[11px] font-medium" style={{ color: 'rgba(232,242,224,0.55)' }}>WhatsApp</span>
          </button>

          {/* Telegram */}
          <button
            onClick={handleTelegram}
            className="flex-1 flex flex-col items-center gap-2 py-3.5 rounded-[12px] transition-all"
            style={{
              background: 'rgba(232,242,224,0.05)',
              border: '0.5px solid rgba(232,242,224,0.08)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(232,242,224,0.55)">
              <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            <span className="text-[11px] font-medium" style={{ color: 'rgba(232,242,224,0.55)' }}>Telegram</span>
          </button>
        </div>
      </div>
    </div>
  )
}
