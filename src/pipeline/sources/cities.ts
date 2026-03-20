/**
 * 50 cities across Europe and North America for event scraping.
 * Each city has a name, country, and coordinates.
 */

export interface City {
  name: string
  country: string
  lat: number
  lng: number
}

export const CITIES: City[] = [
  // Portugal
  { name: 'Lisbon', country: 'Portugal', lat: 38.7223, lng: -9.1393 },
  { name: 'Porto', country: 'Portugal', lat: 41.1579, lng: -8.6291 },

  // Germany
  { name: 'Berlin', country: 'Germany', lat: 52.5200, lng: 13.4050 },
  { name: 'Hamburg', country: 'Germany', lat: 53.5511, lng: 9.9937 },
  { name: 'Munich', country: 'Germany', lat: 48.1351, lng: 11.5820 },
  { name: 'Cologne', country: 'Germany', lat: 50.9375, lng: 6.9603 },
  { name: 'Frankfurt', country: 'Germany', lat: 50.1109, lng: 8.6821 },
  { name: 'Freiburg', country: 'Germany', lat: 47.9990, lng: 7.8421 },

  // Netherlands
  { name: 'Amsterdam', country: 'Netherlands', lat: 52.3676, lng: 4.9041 },
  { name: 'Rotterdam', country: 'Netherlands', lat: 51.9225, lng: 4.4792 },
  { name: 'Utrecht', country: 'Netherlands', lat: 52.0907, lng: 5.1214 },
  { name: 'Wageningen', country: 'Netherlands', lat: 51.9692, lng: 5.6654 },

  // United Kingdom
  { name: 'London', country: 'United Kingdom', lat: 51.5074, lng: -0.1278 },
  { name: 'Manchester', country: 'United Kingdom', lat: 53.4808, lng: -2.2426 },
  { name: 'Bristol', country: 'United Kingdom', lat: 51.4545, lng: -2.5879 },
  { name: 'Edinburgh', country: 'United Kingdom', lat: 55.9533, lng: -3.1883 },
  { name: 'Brighton', country: 'United Kingdom', lat: 50.8225, lng: -0.1372 },
  { name: 'Oxford', country: 'United Kingdom', lat: 51.7520, lng: -1.2577 },

  // France
  { name: 'Paris', country: 'France', lat: 48.8566, lng: 2.3522 },
  { name: 'Lyon', country: 'France', lat: 45.7640, lng: 4.8357 },
  { name: 'Marseille', country: 'France', lat: 43.2965, lng: 5.3698 },
  { name: 'Bordeaux', country: 'France', lat: 44.8378, lng: -0.5792 },
  { name: 'Toulouse', country: 'France', lat: 43.6047, lng: 1.4442 },

  // Belgium
  { name: 'Brussels', country: 'Belgium', lat: 50.8503, lng: 4.3517 },
  { name: 'Ghent', country: 'Belgium', lat: 51.0543, lng: 3.7174 },
  { name: 'Antwerp', country: 'Belgium', lat: 51.2194, lng: 4.4025 },

  // Spain
  { name: 'Barcelona', country: 'Spain', lat: 41.3874, lng: 2.1686 },
  { name: 'Madrid', country: 'Spain', lat: 40.4168, lng: -3.7038 },
  { name: 'Seville', country: 'Spain', lat: 37.3891, lng: -5.9845 },
  { name: 'Valencia', country: 'Spain', lat: 39.4699, lng: -0.3763 },
  { name: 'Bilbao', country: 'Spain', lat: 43.2630, lng: -2.9350 },

  // Italy
  { name: 'Rome', country: 'Italy', lat: 41.9028, lng: 12.4964 },
  { name: 'Milan', country: 'Italy', lat: 45.4642, lng: 9.1900 },
  { name: 'Bologna', country: 'Italy', lat: 44.4949, lng: 11.3426 },
  { name: 'Florence', country: 'Italy', lat: 43.7696, lng: 11.2558 },
  { name: 'Turin', country: 'Italy', lat: 45.0703, lng: 7.6869 },

  // Switzerland
  { name: 'Zurich', country: 'Switzerland', lat: 47.3769, lng: 8.5417 },
  { name: 'Geneva', country: 'Switzerland', lat: 46.2044, lng: 6.1432 },
  { name: 'Basel', country: 'Switzerland', lat: 47.5596, lng: 7.5886 },
  { name: 'Bern', country: 'Switzerland', lat: 46.9480, lng: 7.4474 },

  // Malta
  { name: 'Valletta', country: 'Malta', lat: 35.8989, lng: 14.5146 },

  // Canada
  { name: 'Vancouver', country: 'Canada', lat: 49.2827, lng: -123.1207 },
  { name: 'Toronto', country: 'Canada', lat: 43.6532, lng: -79.3832 },
  { name: 'Montreal', country: 'Canada', lat: 45.5017, lng: -73.5673 },

  // United States
  { name: 'New York', country: 'United States', lat: 40.7128, lng: -74.0060 },
  { name: 'San Francisco', country: 'United States', lat: 37.7749, lng: -122.4194 },
  { name: 'Portland', country: 'United States', lat: 45.5152, lng: -122.6784 },
  { name: 'Seattle', country: 'United States', lat: 47.6062, lng: -122.3321 },
  { name: 'Austin', country: 'United States', lat: 30.2672, lng: -97.7431 },
]
