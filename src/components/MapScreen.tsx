'use client'

import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import { useEffect } from 'react'
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

const typeLabel: Record<string, string> = {
  nature: 'Nature', food: 'Food', craft: 'Craft',
  community: 'Community', wellness: 'Wellness', learning: 'Learning',
}

export default function MapScreen({ quests, userLocation, onSelectQuest }: Props) {
  const center: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : [38.72, -9.14]

  return (
    <div className="flex flex-col w-full" style={{ background: '#0D1A0B', minHeight: 'calc(100dvh - 72px)' }}>
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-3" style={{ background: '#0D1A0B' }}>
        <h1 className="font-heading text-[20px] font-light" style={{ color: '#E8F2E0' }}>
          Living <em style={{ color: '#C8913A' }}>Map</em>
        </h1>
        <p className="text-[10px] mt-0.5" style={{ color: 'rgba(232,242,224,0.4)' }}>
          {quests.length} quest{quests.length !== 1 ? 's' : ''} near you
        </p>
      </div>

      {/* Full-screen map */}
      <div className="flex-1 relative overflow-hidden" style={{ borderTop: '0.5px solid rgba(232,242,224,0.06)' }}>
        <style>{`
          .map-screen-container .leaflet-tile-pane {
            filter: none !important;
          }
          .map-screen-container .leaflet-container {
            background: #0D1A0B;
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
                    <div style={{ fontFamily: 'var(--font-outfit), sans-serif', padding: 2 }}>
                      <span style={{ fontWeight: 600, color: '#0D1A0B' }}>You are here</span>
                    </div>
                  </Popup>
                </CircleMarker>
              </>
            )}

            {/* Quest pins */}
            {quests.map((q) => {
              const cat = CATEGORIES[q.category as keyof typeof CATEGORIES]
              const color = cat?.color ?? '#C8913A'
              return (
                <CircleMarker
                  key={q.id}
                  center={[q.lat, q.lng]}
                  radius={8}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 2 }}
                  eventHandlers={{ click: () => onSelectQuest(q) }}
                >
                  <Popup>
                    <div style={{ fontFamily: 'var(--font-outfit), sans-serif', padding: 2, maxWidth: 200 }}>
                      <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color, letterSpacing: '0.06em', marginBottom: 2 }}>
                        {cat?.emoji ?? ''} {typeLabel[q.category] ?? q.category}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0D1A0B', lineHeight: 1.3 }}>
                        {q.title}
                      </div>
                      <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                        {q.distance_km.toFixed(1)} km away
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
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
