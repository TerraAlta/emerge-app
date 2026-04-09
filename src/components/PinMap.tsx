'use client'

import { MapContainer, TileLayer, CircleMarker, useMapEvents } from 'react-leaflet'

interface Props {
  pin: { lat: number; lng: number } | null
  onPin: (pin: { lat: number; lng: number }) => void
}

function ClickHandler({ onPin }: { onPin: (p: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      onPin({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

export default function PinMap({ pin, onPin }: Props) {
  // Default to Lisbon
  const center: [number, number] = pin ? [pin.lat, pin.lng] : [38.72, -9.14]

  return (
    <MapContainer
      center={center}
      zoom={13}
      className="h-full w-full"
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
      <ClickHandler onPin={onPin} />
      {pin && (
        <CircleMarker
          center={[pin.lat, pin.lng]}
          radius={9}
          pathOptions={{
            color: '#C8913A',
            fillColor: '#C8913A',
            fillOpacity: 0.9,
            weight: 2,
          }}
        />
      )}
    </MapContainer>
  )
}
