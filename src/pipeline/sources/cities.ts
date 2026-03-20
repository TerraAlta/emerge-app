/**
 * 201 cities across Europe, North America, Scandinavia, and the British Isles for event scraping.
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
  { name: 'Braga', country: 'Portugal', lat: 41.5518, lng: -8.4229 },
  { name: 'Coimbra', country: 'Portugal', lat: 40.2033, lng: -8.4103 },
  { name: 'Évora', country: 'Portugal', lat: 38.5667, lng: -7.9000 },
  { name: 'Faro', country: 'Portugal', lat: 37.0194, lng: -7.9322 },
  { name: 'Setúbal', country: 'Portugal', lat: 38.5243, lng: -8.8926 },
  { name: 'Sintra', country: 'Portugal', lat: 38.8029, lng: -9.3817 },
  { name: 'Cascais', country: 'Portugal', lat: 38.6979, lng: -9.4215 },
  { name: 'Viseu', country: 'Portugal', lat: 40.6566, lng: -7.9122 },
  { name: 'Aveiro', country: 'Portugal', lat: 40.6405, lng: -8.6538 },

  // Germany
  { name: 'Berlin', country: 'Germany', lat: 52.5200, lng: 13.4050 },
  { name: 'Hamburg', country: 'Germany', lat: 53.5511, lng: 9.9937 },
  { name: 'Munich', country: 'Germany', lat: 48.1351, lng: 11.5820 },
  { name: 'Cologne', country: 'Germany', lat: 50.9375, lng: 6.9603 },
  { name: 'Frankfurt', country: 'Germany', lat: 50.1109, lng: 8.6821 },
  { name: 'Freiburg', country: 'Germany', lat: 47.9990, lng: 7.8421 },
  { name: 'Stuttgart', country: 'Germany', lat: 48.7758, lng: 9.1829 },
  { name: 'Leipzig', country: 'Germany', lat: 51.3397, lng: 12.3731 },
  { name: 'Dresden', country: 'Germany', lat: 51.0504, lng: 13.7373 },
  { name: 'Hannover', country: 'Germany', lat: 52.3759, lng: 9.7320 },
  { name: 'Nuremberg', country: 'Germany', lat: 49.4521, lng: 11.0767 },
  { name: 'Heidelberg', country: 'Germany', lat: 49.3988, lng: 8.6724 },
  { name: 'Münster', country: 'Germany', lat: 51.9607, lng: 7.6261 },
  { name: 'Tübingen', country: 'Germany', lat: 48.5216, lng: 9.0576 },

  // Netherlands
  { name: 'Amsterdam', country: 'Netherlands', lat: 52.3676, lng: 4.9041 },
  { name: 'Rotterdam', country: 'Netherlands', lat: 51.9225, lng: 4.4792 },
  { name: 'Utrecht', country: 'Netherlands', lat: 52.0907, lng: 5.1214 },
  { name: 'Wageningen', country: 'Netherlands', lat: 51.9692, lng: 5.6654 },
  { name: 'Eindhoven', country: 'Netherlands', lat: 51.4416, lng: 5.4697 },
  { name: 'Groningen', country: 'Netherlands', lat: 53.2194, lng: 6.5665 },
  { name: 'Leiden', country: 'Netherlands', lat: 52.1601, lng: 4.4970 },
  { name: 'Haarlem', country: 'Netherlands', lat: 52.3874, lng: 4.6462 },
  { name: 'Nijmegen', country: 'Netherlands', lat: 51.8426, lng: 5.8546 },
  { name: 'Tilburg', country: 'Netherlands', lat: 51.5555, lng: 5.0913 },
  { name: 'Delft', country: 'Netherlands', lat: 52.0116, lng: 4.3571 },
  { name: 'Breda', country: 'Netherlands', lat: 51.5719, lng: 4.7683 },
  { name: 'Arnhem', country: 'Netherlands', lat: 51.9851, lng: 5.8987 },
  { name: 'Zwolle', country: 'Netherlands', lat: 52.5168, lng: 6.0830 },

  // United Kingdom
  { name: 'London', country: 'United Kingdom', lat: 51.5074, lng: -0.1278 },
  { name: 'Manchester', country: 'United Kingdom', lat: 53.4808, lng: -2.2426 },
  { name: 'Bristol', country: 'United Kingdom', lat: 51.4545, lng: -2.5879 },
  { name: 'Edinburgh', country: 'United Kingdom', lat: 55.9533, lng: -3.1883 },
  { name: 'Brighton', country: 'United Kingdom', lat: 50.8225, lng: -0.1372 },
  { name: 'Oxford', country: 'United Kingdom', lat: 51.7520, lng: -1.2577 },
  { name: 'Cardiff', country: 'United Kingdom', lat: 51.4816, lng: -3.1791 },
  { name: 'Leeds', country: 'United Kingdom', lat: 53.8008, lng: -1.5491 },
  { name: 'Liverpool', country: 'United Kingdom', lat: 53.4084, lng: -2.9916 },
  { name: 'Newcastle', country: 'United Kingdom', lat: 54.9783, lng: -1.6178 },
  { name: 'Nottingham', country: 'United Kingdom', lat: 52.9548, lng: -1.1581 },
  { name: 'Sheffield', country: 'United Kingdom', lat: 53.3811, lng: -1.4701 },
  { name: 'Glasgow', country: 'United Kingdom', lat: 55.8642, lng: -4.2518 },
  { name: 'Birmingham', country: 'United Kingdom', lat: 52.4862, lng: -1.8904 },
  { name: 'Exeter', country: 'United Kingdom', lat: 50.7184, lng: -3.5339 },
  { name: 'York', country: 'United Kingdom', lat: 53.9590, lng: -1.0815 },
  { name: 'Totnes', country: 'United Kingdom', lat: 50.4327, lng: -3.6862 },
  // Wales
  { name: 'Swansea', country: 'United Kingdom', lat: 51.6214, lng: -3.9436 },
  { name: 'Newport', country: 'United Kingdom', lat: 51.5842, lng: -2.9977 },
  { name: 'Aberystwyth', country: 'United Kingdom', lat: 52.4153, lng: -4.0829 },
  { name: 'Machynlleth', country: 'United Kingdom', lat: 52.5849, lng: -3.8525 },
  { name: 'Bangor', country: 'United Kingdom', lat: 53.2282, lng: -4.1293 },
  { name: 'Brecon', country: 'United Kingdom', lat: 51.9465, lng: -3.3888 },
  { name: 'Caernarfon', country: 'United Kingdom', lat: 53.1388, lng: -4.2732 },
  // Scotland
  { name: 'Inverness', country: 'United Kingdom', lat: 57.4778, lng: -4.2247 },
  { name: 'Stirling', country: 'United Kingdom', lat: 56.1165, lng: -3.9369 },
  { name: 'Perth', country: 'United Kingdom', lat: 56.3950, lng: -3.4312 },
  { name: 'Dundee', country: 'United Kingdom', lat: 56.4620, lng: -2.9707 },
  { name: 'Forres', country: 'United Kingdom', lat: 57.6137, lng: -3.6227 },
  { name: 'Isle of Arran', country: 'United Kingdom', lat: 55.5745, lng: -5.2427 },
  { name: 'Aberdeen', country: 'United Kingdom', lat: 57.1497, lng: -2.0943 },

  // France
  { name: 'Paris', country: 'France', lat: 48.8566, lng: 2.3522 },
  { name: 'Lyon', country: 'France', lat: 45.7640, lng: 4.8357 },
  { name: 'Marseille', country: 'France', lat: 43.2965, lng: 5.3698 },
  { name: 'Bordeaux', country: 'France', lat: 44.8378, lng: -0.5792 },
  { name: 'Toulouse', country: 'France', lat: 43.6047, lng: 1.4442 },
  { name: 'Montpellier', country: 'France', lat: 43.6108, lng: 3.8767 },
  { name: 'Nantes', country: 'France', lat: 47.2184, lng: -1.5536 },
  { name: 'Rennes', country: 'France', lat: 48.1173, lng: -1.6778 },
  { name: 'Strasbourg', country: 'France', lat: 48.5734, lng: 7.7521 },
  { name: 'Grenoble', country: 'France', lat: 45.1885, lng: 5.7245 },
  { name: 'Lille', country: 'France', lat: 50.6292, lng: 3.0573 },
  { name: 'Clermont-Ferrand', country: 'France', lat: 45.7797, lng: 3.0863 },
  { name: 'Angers', country: 'France', lat: 47.4784, lng: -0.5632 },
  { name: 'Dijon', country: 'France', lat: 47.3220, lng: 5.0415 },

  // Belgium
  { name: 'Brussels', country: 'Belgium', lat: 50.8503, lng: 4.3517 },
  { name: 'Ghent', country: 'Belgium', lat: 51.0543, lng: 3.7174 },
  { name: 'Antwerp', country: 'Belgium', lat: 51.2194, lng: 4.4025 },
  { name: 'Liège', country: 'Belgium', lat: 50.6326, lng: 5.5797 },
  { name: 'Bruges', country: 'Belgium', lat: 51.2093, lng: 3.2247 },
  { name: 'Leuven', country: 'Belgium', lat: 50.8798, lng: 4.7005 },
  { name: 'Namur', country: 'Belgium', lat: 50.4669, lng: 4.8675 },
  { name: 'Mechelen', country: 'Belgium', lat: 51.0281, lng: 4.4803 },
  { name: 'Hasselt', country: 'Belgium', lat: 50.9311, lng: 5.3378 },
  { name: 'Charleroi', country: 'Belgium', lat: 50.4108, lng: 4.4446 },

  // Spain
  { name: 'Barcelona', country: 'Spain', lat: 41.3874, lng: 2.1686 },
  { name: 'Madrid', country: 'Spain', lat: 40.4168, lng: -3.7038 },
  { name: 'Seville', country: 'Spain', lat: 37.3891, lng: -5.9845 },
  { name: 'Valencia', country: 'Spain', lat: 39.4699, lng: -0.3763 },
  { name: 'Bilbao', country: 'Spain', lat: 43.2630, lng: -2.9350 },
  { name: 'Zaragoza', country: 'Spain', lat: 41.6488, lng: -0.8891 },
  { name: 'Málaga', country: 'Spain', lat: 36.7213, lng: -4.4214 },
  { name: 'San Sebastián', country: 'Spain', lat: 43.3183, lng: -1.9812 },
  { name: 'Santiago de Compostela', country: 'Spain', lat: 42.8782, lng: -8.5448 },
  { name: 'Palma de Mallorca', country: 'Spain', lat: 39.5696, lng: 2.6502 },
  { name: 'Granada', country: 'Spain', lat: 37.1773, lng: -3.5986 },
  { name: 'Córdoba', country: 'Spain', lat: 37.8845, lng: -4.7794 },
  { name: 'Valladolid', country: 'Spain', lat: 41.6523, lng: -4.7245 },
  { name: 'Salamanca', country: 'Spain', lat: 40.9701, lng: -5.6635 },

  // Italy
  { name: 'Rome', country: 'Italy', lat: 41.9028, lng: 12.4964 },
  { name: 'Milan', country: 'Italy', lat: 45.4642, lng: 9.1900 },
  { name: 'Bologna', country: 'Italy', lat: 44.4949, lng: 11.3426 },
  { name: 'Florence', country: 'Italy', lat: 43.7696, lng: 11.2558 },
  { name: 'Turin', country: 'Italy', lat: 45.0703, lng: 7.6869 },
  { name: 'Naples', country: 'Italy', lat: 40.8518, lng: 14.2681 },
  { name: 'Palermo', country: 'Italy', lat: 38.1157, lng: 13.3615 },
  { name: 'Padova', country: 'Italy', lat: 45.4064, lng: 11.8768 },
  { name: 'Verona', country: 'Italy', lat: 45.4384, lng: 10.9916 },
  { name: 'Trieste', country: 'Italy', lat: 45.6495, lng: 13.7768 },
  { name: 'Bari', country: 'Italy', lat: 41.1171, lng: 16.8719 },
  { name: 'Catania', country: 'Italy', lat: 37.5079, lng: 15.0830 },
  { name: 'Genova', country: 'Italy', lat: 44.4056, lng: 8.9463 },
  { name: 'Perugia', country: 'Italy', lat: 43.1107, lng: 12.3908 },

  // Switzerland
  { name: 'Zurich', country: 'Switzerland', lat: 47.3769, lng: 8.5417 },
  { name: 'Geneva', country: 'Switzerland', lat: 46.2044, lng: 6.1432 },
  { name: 'Basel', country: 'Switzerland', lat: 47.5596, lng: 7.5886 },
  { name: 'Bern', country: 'Switzerland', lat: 46.9480, lng: 7.4474 },
  { name: 'Lausanne', country: 'Switzerland', lat: 46.5197, lng: 6.6323 },
  { name: 'Winterthur', country: 'Switzerland', lat: 47.4988, lng: 8.7240 },
  { name: 'St. Gallen', country: 'Switzerland', lat: 47.4245, lng: 9.3767 },
  { name: 'Lucerne', country: 'Switzerland', lat: 47.0502, lng: 8.3093 },
  { name: 'Lugano', country: 'Switzerland', lat: 46.0037, lng: 8.9511 },

  // Ireland
  { name: 'Dublin', country: 'Ireland', lat: 53.3498, lng: -6.2603 },
  { name: 'Cork', country: 'Ireland', lat: 51.8985, lng: -8.4756 },
  { name: 'Galway', country: 'Ireland', lat: 53.2707, lng: -9.0568 },
  { name: 'Limerick', country: 'Ireland', lat: 52.6638, lng: -8.6267 },
  { name: 'Waterford', country: 'Ireland', lat: 52.2593, lng: -7.1101 },
  { name: 'Cloughjordan', country: 'Ireland', lat: 52.9397, lng: -8.0261 },
  { name: 'Kilkenny', country: 'Ireland', lat: 52.6541, lng: -7.2448 },

  // Austria
  { name: 'Vienna', country: 'Austria', lat: 48.2082, lng: 16.3738 },
  { name: 'Graz', country: 'Austria', lat: 47.0707, lng: 15.4395 },
  { name: 'Linz', country: 'Austria', lat: 48.3069, lng: 14.2858 },
  { name: 'Salzburg', country: 'Austria', lat: 47.8095, lng: 13.0550 },
  { name: 'Innsbruck', country: 'Austria', lat: 47.2692, lng: 11.4041 },
  { name: 'Klagenfurt', country: 'Austria', lat: 46.6228, lng: 14.3051 },
  { name: 'St. Pölten', country: 'Austria', lat: 48.2000, lng: 15.6333 },

  // Luxembourg
  { name: 'Luxembourg City', country: 'Luxembourg', lat: 49.6116, lng: 6.1319 },
  { name: 'Esch-sur-Alzette', country: 'Luxembourg', lat: 49.4958, lng: 5.9806 },
  { name: 'Differdange', country: 'Luxembourg', lat: 49.5239, lng: 5.8894 },
  { name: 'Dudelange', country: 'Luxembourg', lat: 49.4809, lng: 6.0878 },

  // Denmark
  { name: 'Copenhagen', country: 'Denmark', lat: 55.6761, lng: 12.5683 },
  { name: 'Aarhus', country: 'Denmark', lat: 56.1629, lng: 10.2039 },
  { name: 'Odense', country: 'Denmark', lat: 55.3959, lng: 10.3883 },
  { name: 'Aalborg', country: 'Denmark', lat: 57.0488, lng: 9.9217 },
  { name: 'Roskilde', country: 'Denmark', lat: 55.6415, lng: 12.0803 },
  { name: 'Vejle', country: 'Denmark', lat: 55.7113, lng: 9.5360 },

  // Finland
  { name: 'Helsinki', country: 'Finland', lat: 60.1699, lng: 24.9384 },
  { name: 'Tampere', country: 'Finland', lat: 61.4978, lng: 23.7610 },
  { name: 'Turku', country: 'Finland', lat: 60.4518, lng: 22.2666 },
  { name: 'Oulu', country: 'Finland', lat: 65.0121, lng: 25.4651 },
  { name: 'Jyväskylä', country: 'Finland', lat: 62.2415, lng: 25.7209 },
  { name: 'Espoo', country: 'Finland', lat: 60.2055, lng: 24.6559 },
  { name: 'Lahti', country: 'Finland', lat: 60.9827, lng: 25.6612 },

  // Malta
  { name: 'Valletta', country: 'Malta', lat: 35.8989, lng: 14.5146 },
  { name: 'Sliema', country: 'Malta', lat: 35.9117, lng: 14.5019 },
  { name: 'St. Julian\'s', country: 'Malta', lat: 35.9186, lng: 14.4891 },
  { name: 'Mdina', country: 'Malta', lat: 35.8877, lng: 14.4019 },
  { name: 'Gozo', country: 'Malta', lat: 36.0441, lng: 14.2394 },

  // Canada
  { name: 'Vancouver', country: 'Canada', lat: 49.2827, lng: -123.1207 },
  { name: 'Toronto', country: 'Canada', lat: 43.6532, lng: -79.3832 },
  { name: 'Montreal', country: 'Canada', lat: 45.5017, lng: -73.5673 },
  { name: 'Ottawa', country: 'Canada', lat: 45.4215, lng: -75.6972 },
  { name: 'Calgary', country: 'Canada', lat: 51.0447, lng: -114.0719 },
  { name: 'Edmonton', country: 'Canada', lat: 53.5461, lng: -113.4938 },
  { name: 'Winnipeg', country: 'Canada', lat: 49.8951, lng: -97.1384 },
  { name: 'Halifax', country: 'Canada', lat: 44.6488, lng: -63.5752 },
  { name: 'Victoria', country: 'Canada', lat: 48.4284, lng: -123.3656 },
  { name: 'Quebec City', country: 'Canada', lat: 46.8139, lng: -71.2080 },
  { name: 'Saskatoon', country: 'Canada', lat: 52.1332, lng: -106.6700 },
  { name: 'Regina', country: 'Canada', lat: 50.4452, lng: -104.6189 },
  { name: 'Hamilton', country: 'Canada', lat: 43.2557, lng: -79.8711 },
  { name: 'Kingston', country: 'Canada', lat: 44.2312, lng: -76.4860 },

  // United States
  { name: 'New York', country: 'United States', lat: 40.7128, lng: -74.0060 },
  { name: 'San Francisco', country: 'United States', lat: 37.7749, lng: -122.4194 },
  { name: 'Portland', country: 'United States', lat: 45.5152, lng: -122.6784 },
  { name: 'Seattle', country: 'United States', lat: 47.6062, lng: -122.3321 },
  { name: 'Austin', country: 'United States', lat: 30.2672, lng: -97.7431 },
  { name: 'Chicago', country: 'United States', lat: 41.8781, lng: -87.6298 },
  { name: 'Boston', country: 'United States', lat: 42.3601, lng: -71.0589 },
  { name: 'Denver', country: 'United States', lat: 39.7392, lng: -104.9903 },
  { name: 'Philadelphia', country: 'United States', lat: 39.9526, lng: -75.1652 },
  { name: 'Minneapolis', country: 'United States', lat: 44.9778, lng: -93.2650 },
  { name: 'Los Angeles', country: 'United States', lat: 34.0522, lng: -118.2437 },
  { name: 'Detroit', country: 'United States', lat: 42.3314, lng: -83.0458 },
  { name: 'Atlanta', country: 'United States', lat: 33.7490, lng: -84.3880 },
  { name: 'New Orleans', country: 'United States', lat: 29.9511, lng: -90.0715 },
  { name: 'Asheville', country: 'United States', lat: 35.5951, lng: -82.5515 },
  { name: 'Burlington', country: 'United States', lat: 44.4759, lng: -73.2121 },
  { name: 'Ithaca', country: 'United States', lat: 42.4440, lng: -76.5021 },
]
