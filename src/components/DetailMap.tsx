'use client'

import { MapContainer, TileLayer, Circle, CircleMarker, Tooltip } from 'react-leaflet'

interface Props {
  lat: number
  lng: number
  title: string
  joined: boolean  // show exact pin only after joining
}

export default function DetailMap({ lat, lng, title, joined }: Props) {
  if (!lat || !lng) return null

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={joined ? 15 : 13}
      className="h-full w-full"
      zoomControl={false}
      attributionControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {joined ? (
        /* Exact pin — shown after joining */
        <CircleMarker
          center={[lat, lng]}
          radius={8}
          pathOptions={{ color: '#C8913A', fillColor: '#C8913A', fillOpacity: 0.85, weight: 2 }}
        >
          <Tooltip permanent direction="top" offset={[0, -10]}>
            <span style={{ fontSize: 11, fontWeight: 600 }}>{title}</span>
          </Tooltip>
        </CircleMarker>
      ) : (
        /* Approximate area — 500m radius blur */
        <Circle
          center={[lat, lng]}
          radius={500}
          pathOptions={{
            color: 'rgba(200,145,58,0.4)',
            fillColor: 'rgba(200,145,58,0.15)',
            fillOpacity: 1,
            weight: 1,
            dashArray: '6 4',
          }}
        />
      )}
    </MapContainer>
  )
}
