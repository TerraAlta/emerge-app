'use client'

import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { useState, useEffect, useRef } from 'react'

interface Props {
  initialPin: { lat: number; lng: number } | null
  onConfirm: (pin: { lat: number; lng: number }) => void
  onCancel: () => void
}

function CenterTracker({ onChange }: { onChange: (c: { lat: number; lng: number }) => void }) {
  const map = useMap()
  useMapEvents({
    move() {
      const c = map.getCenter()
      onChange({ lat: c.lat, lng: c.lng })
    },
    moveend() {
      const c = map.getCenter()
      onChange({ lat: c.lat, lng: c.lng })
    },
  })
  return null
}

function ZoomControls() {
  const map = useMap()
  return (
    <div className="absolute top-4 right-4 z-[10001] flex flex-col gap-1.5">
      <button
        onClick={() => map.zoomIn()}
        className="w-9 h-9 rounded-full flex items-center justify-center text-[18px] font-light"
        style={{ background: 'rgba(10,20,10,0.9)', color: '#C8913A', border: '0.5px solid rgba(200,145,58,0.3)' }}
      >
        +
      </button>
      <button
        onClick={() => map.zoomOut()}
        className="w-9 h-9 rounded-full flex items-center justify-center text-[18px] font-light"
        style={{ background: 'rgba(10,20,10,0.9)', color: '#C8913A', border: '0.5px solid rgba(200,145,58,0.3)' }}
      >
        −
      </button>
    </div>
  )
}

export default function FullScreenMap({ initialPin, onConfirm, onCancel }: Props) {
  const center: [number, number] = initialPin
    ? [initialPin.lat, initialPin.lng]
    : [38.72, -9.14]

  const [currentCenter, setCurrentCenter] = useState({ lat: center[0], lng: center[1] })
  const [address, setAddress] = useState('')
  const geocodeTimer = useRef<any>(null)

  // Reverse geocode on center change (debounced)
  useEffect(() => {
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current)
    geocodeTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://photon.komoot.io/reverse?lat=${currentCenter.lat}&lon=${currentCenter.lng}&limit=1&lang=en`
        )
        const data = await res.json()
        const p = data?.features?.[0]?.properties
        const parts = []
        if (p?.street) parts.push(p.street)
        if (p?.district || p?.locality) parts.push(p.district || p.locality)
        if (p?.city || p?.town || p?.village) parts.push(p.city || p.town || p.village)
        setAddress(parts.join(', ') || `${currentCenter.lat.toFixed(4)}, ${currentCenter.lng.toFixed(4)}`)
      } catch {
        setAddress(`${currentCenter.lat.toFixed(4)}, ${currentCenter.lng.toFixed(4)}`)
      }
    }, 500)
    return () => clearTimeout(geocodeTimer.current)
  }, [currentCenter.lat, currentCenter.lng])

  return (
    <div className="fixed inset-0 z-[9999]" style={{ background: '#0D1A0B' }}>
      {/* Dark tiles map — FIX 5 */}
      <style>{`
        .fullscreen-pin-map .leaflet-container { background: #0D1A0B; }
        .fullscreen-pin-map .leaflet-tile-pane { filter: none !important; }
      `}</style>
      <div className="fullscreen-pin-map w-full h-full">
        <MapContainer
          center={center}
          zoom={15}
          className="h-full w-full"
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <CenterTracker onChange={setCurrentCenter} />
          <ZoomControls />
        </MapContainer>
      </div>

      {/* Crosshair — fixed centre */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-[10001]"
      >
        <div className="flex flex-col items-center">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: '#C8913A', boxShadow: '0 2px 12px rgba(200,145,58,0.5)' }}
          >
            <div className="w-2 h-2 rounded-full" style={{ background: '#0D1A0B' }} />
          </div>
          <div className="w-0.5 h-3" style={{ background: '#C8913A' }} />
        </div>
      </div>

      {/* Cancel button */}
      <button
        onClick={onCancel}
        className="absolute top-4 left-4 z-[10001] w-9 h-9 rounded-full flex items-center justify-center text-[16px]"
        style={{ background: 'rgba(10,20,10,0.9)', color: 'rgba(232,242,224,0.7)', border: '0.5px solid rgba(232,242,224,0.15)' }}
      >
        ✕
      </button>

      {/* Bottom bar: address + confirm */}
      <div
        className="absolute bottom-0 left-0 right-0 z-[10001] px-4 pt-3"
        style={{ background: 'rgba(10,20,10,0.95)', paddingBottom: 'calc(16px + var(--sab, 0px))' }}
      >
        <div className="text-center mb-3">
          <p className="text-[9px] uppercase mb-1" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
            Pan to set location
          </p>
          <p className="text-[12px] font-medium truncate" style={{ color: '#E8F2E0' }}>
            📍 {address || 'Loading...'}
          </p>
        </div>
        <button
          onClick={() => onConfirm(currentCenter)}
          className="w-full py-3.5 rounded-[12px] text-[14px] font-semibold"
          style={{ background: '#C8913A', color: '#0D1A0B' }}
        >
          Confirm location
        </button>
      </div>
    </div>
  )
}
