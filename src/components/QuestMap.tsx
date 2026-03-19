'use client'

import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import { useEffect } from 'react'
import { CATEGORIES } from '@/lib/categories'
import type { Quest } from '@/types/database'

interface NearbyQuest extends Quest {
  distance_km: number
}

interface Props {
  quests: NearbyQuest[]
  userLocation: { lat: number; lng: number } | null
}

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(center, 12, { duration: 1.5 })
  }, [map, center])
  return null
}

export default function QuestMap({ quests, userLocation }: Props) {
  const center: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : [38.72, -9.14] // Lisbon fallback

  return (
    <MapContainer
      center={center}
      zoom={12}
      className="h-full w-full"
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {userLocation && <MapUpdater center={[userLocation.lat, userLocation.lng]} />}

      {/* User location pulse */}
      {userLocation && (
        <CircleMarker
          center={[userLocation.lat, userLocation.lng]}
          radius={8}
          pathOptions={{ color: '#C8913A', fillColor: '#C8913A', fillOpacity: 0.6, weight: 2 }}
        >
          <Tooltip>You are here</Tooltip>
        </CircleMarker>
      )}

      {/* Quest dots */}
      {quests.map((q) => {
        const cat = CATEGORIES[q.category as keyof typeof CATEGORIES]
        const color = cat?.color ?? '#C8913A'
        return (
          <CircleMarker
            key={q.id}
            center={[q.lat, q.lng]}
            radius={7}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 1.5 }}
          >
            <Tooltip>
              <span style={{ fontWeight: 600 }}>{q.title}</span>
              <br />
              <span style={{ opacity: 0.7 }}>{q.distance_km.toFixed(1)} km</span>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
