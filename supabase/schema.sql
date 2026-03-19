-- Emerge: Regenerative Community Quest App
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- 1. Enable PostGIS extension for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Quests table
CREATE TABLE IF NOT EXISTS quests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT 'community'
                CHECK (category IN ('nature', 'food', 'craft', 'community', 'wellness', 'learning')),

  -- PostGIS geography point for geospatial indexing
  geog          GEOGRAPHY(POINT, 4326) NOT NULL,
  address       TEXT NOT NULL DEFAULT '',

  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ,

  source_url    TEXT,
  source_name   TEXT NOT NULL DEFAULT 'manual',

  -- AI scoring fields
  ai_score      SMALLINT NOT NULL DEFAULT 0 CHECK (ai_score BETWEEN 0 AND 100),
  ai_reasoning  TEXT NOT NULL DEFAULT '',

  image_url     TEXT,
  max_participants INTEGER,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Spatial index for fast nearby queries
CREATE INDEX IF NOT EXISTS idx_quests_geog ON quests USING GIST (geog);

-- 4. Index for filtering by upcoming events
CREATE INDEX IF NOT EXISTS idx_quests_starts_at ON quests (starts_at);

-- 5. Index for filtering by category
CREATE INDEX IF NOT EXISTS idx_quests_category ON quests (category);

-- 6. Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quests_updated_at ON quests;
CREATE TRIGGER quests_updated_at
  BEFORE UPDATE ON quests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 7. Function: find nearby quests within a radius (km)
CREATE OR REPLACE FUNCTION nearby_quests(
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION DEFAULT 25
)
RETURNS TABLE (
  id              UUID,
  title           TEXT,
  description     TEXT,
  category        TEXT,
  address         TEXT,
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  source_url      TEXT,
  source_name     TEXT,
  ai_score        SMALLINT,
  ai_reasoning    TEXT,
  image_url       TEXT,
  max_participants INTEGER,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  distance_km     DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    q.id, q.title, q.description, q.category, q.address,
    q.starts_at, q.ends_at, q.source_url, q.source_name,
    q.ai_score, q.ai_reasoning, q.image_url, q.max_participants,
    q.created_at, q.updated_at,
    ST_Y(q.geog::geometry) AS lat,
    ST_X(q.geog::geometry) AS lng,
    ST_Distance(q.geog, ST_Point(user_lng, user_lat)::geography) / 1000.0 AS distance_km
  FROM quests q
  WHERE ST_DWithin(q.geog, ST_Point(user_lng, user_lat)::geography, radius_km * 1000)
    AND q.starts_at >= now()
  ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql;

-- 8. Row Level Security
ALTER TABLE quests ENABLE ROW LEVEL SECURITY;

-- Public read access (anyone can browse quests)
CREATE POLICY "Quests are publicly readable"
  ON quests FOR SELECT
  USING (true);

-- Only service role can insert/update (pipeline writes via service key)
CREATE POLICY "Service role can insert quests"
  ON quests FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update quests"
  ON quests FOR UPDATE
  USING (auth.role() = 'service_role');
