'use client'

import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import { useEffect, useRef } from 'react'
import { CATEGORIES } from '@/lib/categories'
import type { Quest } from '@/types/database'

interface NearbyQuest extends Quest {
  distance_km: number
}

interface Props {
  quests: NearbyQuest[]
  userLocation: { lat: number; lng: number } | null
  onSelectQuest: (quest: NearbyQuest) => void
}

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(center, 12, { duration: 1.5 })
  }, [map, center])
  return null
}

const PILL_COLORS: Record<string, { bg: string; text: string }> = {
  nature:    { bg: '#E8F5E9', text: '#2E7D32' },
  food:      { bg: '#FFF8E1', text: '#E65100' },
  craft:     { bg: '#EFEBE9', text: '#4E342E' },
  community: { bg: '#E3F2FD', text: '#1565C0' },
  wellness:  { bg: '#F3E5F5', text: '#6A1B9A' },
  learning:  { bg: '#E8EAF6', text: '#283593' },
  feast:     { bg: '#FFF8DC', text: '#8B6914' },
  play:      { bg: '#FBE9E7', text: '#BF360C' },
  make:      { bg: '#F5F0E8', text: '#6D4C2A' },
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function getDirectionsUrl(lat: number, lng: number): string {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  return isIOS
    ? `https://maps.apple.com/?q=${lat},${lng}`
    : `https://maps.google.com/?q=${lat},${lng}`
}

export default function MapScreen({ quests, userLocation, onSelectQuest }: Props) {
  const center: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : [38.72, -9.14]

  return (
    <div className="flex flex-col w-full" style={{ background: '#0D1A0B', minHeight: 'calc(100dvh - 72px)' }}>
      {/* Header */}
      <div className="shrink-0 px-4 pb-3" style={{ background: '#0D1A0B', paddingTop: 'calc(16px + var(--sat, 0px))' }}>
        <h1 className="font-heading text-[20px] font-light" style={{ color: '#E8F2E0' }}>
          Living <em style={{ color: '#C8913A' }}>Map</em>
        </h1>
        <p className="text-[10px] mt-0.5" style={{ color: 'rgba(232,242,224,0.4)' }}>
          {quests.length} quest{quests.length !== 1 ? 's' : ''} near you
        </p>
      </div>

      {/* Map area */}
      <div className="relative overflow-hidden" style={{ height: 'calc(100dvh - 72px - 56px)', borderTop: '0.5px solid rgba(232,242,224,0.06)' }}>
        <style>{`
          .map-screen-container .leaflet-tile-pane {
            filter: none !important;
          }
          .map-screen-container .leaflet-container {
            background: #0D1A0B;
          }
          /* Override Leaflet popup styles for dark theme */
          .map-screen-container .leaflet-popup-content-wrapper {
            background: rgba(10, 20, 10, 0.97) !important;
            border: 0.5px solid rgba(200, 145, 58, 0.4) !important;
            border-radius: 10px !important;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
            padding: 0 !important;
            animation: popup-fade-in 150ms ease-out;
          }
          .map-screen-container .leaflet-popup-content {
            margin: 0 !important;
            width: 200px !important;
          }
          @media (min-width: 640px) {
            .map-screen-container .leaflet-popup-content {
              width: 220px !important;
            }
          }
          .map-screen-container .leaflet-popup-tip {
            background: rgba(10, 20, 10, 0.97) !important;
            border: none !important;
            box-shadow: none !important;
          }
          .map-screen-container .leaflet-popup-close-button {
            display: none !important;
          }
          @keyframes popup-fade-in {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes map-pulse {
            0% { transform: scale(1); opacity: 0.7; }
            50% { transform: scale(1.8); opacity: 0; }
            100% { transform: scale(1); opacity: 0; }
          }
        `}</style>
        <div className="map-screen-container h-full w-full">
          <MapContainer
            center={center}
            zoom={12}
            className="h-full w-full"
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            {userLocation && <MapUpdater center={[userLocation.lat, userLocation.lng]} />}

            {/* User location — pulsing amber dot */}
            {userLocation && (
              <>
                <CircleMarker
                  center={[userLocation.lat, userLocation.lng]}
                  radius={14}
                  pathOptions={{ color: '#C8913A', fillColor: '#C8913A', fillOpacity: 0.15, weight: 1, opacity: 0.4 }}
                />
                <CircleMarker
                  center={[userLocation.lat, userLocation.lng]}
                  radius={6}
                  pathOptions={{ color: '#C8913A', fillColor: '#C8913A', fillOpacity: 0.9, weight: 2 }}
                >
                  <Popup>
                    <div style={{ padding: '8px 10px' }}>
                      <span style={{ fontWeight: 600, color: '#E8F2E0', fontSize: 11 }}>You are here</span>
                    </div>
                  </Popup>
                </CircleMarker>
              </>
            )}

            {/* Quest pins */}
            {quests.map((q) => {
              const cat = CATEGORIES[q.category as keyof typeof CATEGORIES]
              const color = cat?.color ?? '#C8913A'
              const pill = PILL_COLORS[q.category] ?? { bg: '#FFF8E1', text: '#A0522D' }
              return (
                <QuestDot key={q.id} quest={q} color={color} pill={pill} cat={cat} onSelect={onSelectQuest} />
              )
            })}
          </MapContainer>
        </div>

        {/* Legend overlay */}
        <div
          className="absolute bottom-4 left-3 right-3 rounded-[12px] px-3 py-2.5 flex flex-wrap gap-2 z-[1000]"
          style={{ background: 'rgba(22,40,20,0.92)', border: '0.5px solid rgba(200,145,58,0.2)', backdropFilter: 'blur(8px)' }}
        >
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: cat.color }} />
              <span className="text-[9px]" style={{ color: 'rgba(232,242,224,0.5)' }}>{cat.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: '#C8913A', boxShadow: '0 0 4px #C8913A' }} />
            <span className="text-[9px]" style={{ color: 'rgba(232,242,224,0.5)' }}>You</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Individual quest dot with rich popup */
function QuestDot({
  quest: q,
  color,
  pill,
  cat,
  onSelect,
}: {
  quest: NearbyQuest
  color: string
  pill: { bg: string; text: string }
  cat: { label: string; emoji: string; color: string } | undefined
  onSelect: (q: NearbyQuest) => void
}) {
  const markerRef = useRef<any>(null)

  return (
    <CircleMarker
      ref={markerRef}
      center={[q.lat, q.lng]}
      radius={8}
      pathOptions={{
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 2,
      }}
      eventHandlers={{
        click: () => onSelect(q),
        popupopen: () => {
          // Scale up dot and add white ring
          const el = markerRef.current?.getElement?.()
          if (el) {
            el.style.transform += ' scale(1.3)'
            el.style.filter = 'drop-shadow(0 0 3px rgba(255,255,255,0.6))'
          }
        },
        popupclose: () => {
          // Reset dot
          const el = markerRef.current?.getElement?.()
          if (el) {
            el.style.filter = ''
          }
        },
      }}
    >
      <Popup>
        <div style={{ padding: '10px 12px', fontFamily: 'var(--font-outfit), system-ui, sans-serif' }}>
          {/* Category pill */}
          <div
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 9999,
              fontSize: 9,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              background: pill.bg,
              color: pill.text,
              marginBottom: 6,
            }}
          >
            {cat?.emoji ?? ''} {cat?.label ?? q.category}
          </div>

          {/* Title — max 2 lines */}
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#E8F2E0',
              lineHeight: 1.35,
              marginBottom: 4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {q.title}
          </div>

          {/* Date · Location · Distance */}
          <div style={{ fontSize: 10, color: 'rgba(232,242,224,0.55)', lineHeight: 1.4, marginBottom: 4 }}>
            {formatDate(q.starts_at)} · {q.address || 'Location TBC'} · {q.distance_km.toFixed(1)}km away
          </div>

          {/* Source tag */}
          {q.source_name && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#C8913A', flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: '#C8913A', fontWeight: 500 }}>via {q.source_name}</span>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6 }}>
            <a
              href={`/quests/${q.id}`}
              style={{
                flex: 1,
                display: 'block',
                textAlign: 'center',
                padding: '6px 0',
                borderRadius: 9999,
                background: '#C8913A',
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                textDecoration: 'none',
                lineHeight: 1.3,
              }}
            >
              Go to quest →
            </a>
            <a
              href={getDirectionsUrl(q.lat, q.lng)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                display: 'block',
                textAlign: 'center',
                padding: '6px 0',
                borderRadius: 9999,
                background: 'transparent',
                color: 'rgba(232,242,224,0.7)',
                fontSize: 11,
                fontWeight: 500,
                textDecoration: 'none',
                border: '1px solid rgba(232,242,224,0.2)',
                lineHeight: 1.3,
              }}
            >
              Directions
            </a>
          </div>
        </div>
      </Popup>
    </CircleMarker>
  )
}
