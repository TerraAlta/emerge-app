/** Rough lat/lng for major North American cities */
const NA_CITIES: Record<string, [number, number]> = {
  'new york': [40.7128, -74.0060], 'los angeles': [34.0522, -118.2437],
  'chicago': [41.8781, -87.6298], 'houston': [29.7604, -95.3698],
  'phoenix': [33.4484, -112.0740], 'philadelphia': [39.9526, -75.1652],
  'san antonio': [29.4241, -98.4936], 'san diego': [32.7157, -117.1611],
  'dallas': [32.7767, -96.7970], 'san francisco': [37.7749, -122.4194],
  'seattle': [47.6062, -122.3321], 'denver': [39.7392, -104.9903],
  'portland': [45.5152, -122.6784], 'austin': [30.2672, -97.7431],
  'nashville': [36.1627, -86.7816], 'detroit': [42.3314, -83.0458],
  'minneapolis': [44.9778, -93.2650], 'atlanta': [33.7490, -84.3880],
  'boston': [42.3601, -71.0589], 'miami': [25.7617, -80.1918],
  'asheville': [35.5951, -82.5515], 'ithaca': [42.4440, -76.5019],
  'kutztown': [40.5176, -75.7774], // Rodale Institute
  'emmaus': [40.5393, -75.4966],
  // Canada
  'toronto': [43.6532, -79.3832], 'vancouver': [49.2827, -123.1207],
  'montreal': [45.5017, -73.5673], 'ottawa': [45.4215, -75.6972],
  'calgary': [51.0447, -114.0719], 'edmonton': [53.5461, -113.4938],
  'victoria': [48.4284, -123.3656], 'halifax': [44.6488, -63.5752],
  'winnipeg': [49.8951, -97.1384], 'quebec': [46.8139, -71.2080],
}

export function geocodeNaCity(text: string): { lat: number; lng: number } | null {
  const lower = text.toLowerCase()
  for (const [city, [lat, lng]] of Object.entries(NA_CITIES)) {
    if (lower.includes(city)) return { lat, lng }
  }
  return null
}
