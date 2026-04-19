/**
 * The 7 domains of the Permaculture Flower
 * Each petal represents a domain of regenerative practice.
 * Practitioners select which petals they work in.
 */

export interface FlowerPetal {
  key: string
  label: string
  description: string
  color: string
  examples: string[]
}

export const FLOWER_PETALS: FlowerPetal[] = [
  {
    key: 'land-nature',
    label: 'Land & Nature Stewardship',
    description: 'Working with land, soil, water, forests, and ecosystems',
    color: '#4A7C59',
    examples: ['Permaculture design', 'Agroforestry', 'Rewilding', 'Water harvesting', 'Soil regeneration', 'Food forests', 'Landscape design'],
  },
  {
    key: 'building-technology',
    label: 'Building & Technology',
    description: 'Natural building, appropriate technology, renewable energy',
    color: '#8B6B3D',
    examples: ['Natural building', 'Cob & straw bale', 'Timber framing', 'Earthworks', 'Solar & wind', 'Biogas', 'Composting toilets'],
  },
  {
    key: 'tools-materials',
    label: 'Tools & Materials',
    description: 'Repair, reuse, circular economy, craft, making',
    color: '#6D4C2A',
    examples: ['Repair & upcycling', 'Tool making', 'Blacksmithing', 'Woodworking', 'Textile arts', 'Ceramics', 'Circular design'],
  },
  {
    key: 'health-wellbeing',
    label: 'Health & Wellbeing',
    description: 'Holistic health, nature connection, community care',
    color: '#9B72AA',
    examples: ['Herbalism', 'Forest therapy', 'Ecotherapy', 'Community health', 'Movement & embodiment', 'Nature connection', 'Grief & resilience work'],
  },
  {
    key: 'education-culture',
    label: 'Education & Culture',
    description: 'Teaching, facilitation, art, storytelling, knowledge sharing',
    color: '#6B7DB3',
    examples: ['Permaculture teaching', 'Facilitation', 'Community art', 'Storytelling', 'Youth education', 'Curriculum design', 'Documentary'],
  },
  {
    key: 'finance-economics',
    label: 'Finance & Economics',
    description: 'Regenerative economics, community finance, social enterprise',
    color: '#B07D2E',
    examples: ['Community currencies', 'Cooperative development', 'Social enterprise', 'Regenerative business', 'Community land trusts', 'Ethical investment'],
  },
  {
    key: 'governance-community',
    label: 'Governance & Community',
    description: 'Decision-making, conflict resolution, community building',
    color: '#5B8FA8',
    examples: ['Sociocracy', 'Consensus facilitation', 'Conflict resolution', 'Community organising', 'Ecovillage governance', 'Transition initiatives'],
  },
]

export const PETAL_MAP = Object.fromEntries(FLOWER_PETALS.map(p => [p.key, p]))

export const CLIMATE_ZONES = [
  'Tropical', 'Subtropical', 'Mediterranean', 'Temperate', 'Continental',
  'Arid/Semi-arid', 'Oceanic', 'Subarctic', 'Highland',
]

export const PROJECT_SCALES = [
  'Urban/balcony', 'Garden (<0.5ha)', 'Smallholding (0.5-5ha)',
  'Farm (5-50ha)', 'Estate (50+ha)', 'Community/public space',
  'Institutional', 'Landscape scale',
]

export const AVAILABILITY_OPTIONS = [
  { key: 'available', label: 'Available for new projects', color: '#3D7A2E' },
  { key: 'limited', label: 'Limited availability', color: '#B07D2E' },
  { key: 'waitlist', label: 'Waitlist only', color: '#9B72AA' },
  { key: 'unavailable', label: 'Not taking projects', color: '#999' },
]
