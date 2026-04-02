# Setting Up Keyword Search + National Quests

The UI code is ready for keyword search. Now you need to apply the SQL migration to your Supabase database.

## Step 1: Go to Supabase Dashboard

1. Open https://app.supabase.com
2. Go to your project
3. Click **SQL Editor** in the left sidebar
4. Click **New Query**

## Step 2: Copy and Paste the SQL

Copy the entire SQL from below and paste it into the SQL editor:

```sql
-- Add country_code column to quests table (if not exists)
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT NULL;

-- Index for country filtering
CREATE INDEX IF NOT EXISTS idx_quests_country_code ON quests (country_code);

-- Full-text search index on title + description
CREATE INDEX IF NOT EXISTS idx_quests_search ON quests
USING GIN(to_tsvector('english', title || ' ' || description));

-- 1. Enhanced nearby_quests() with optional keyword search
CREATE OR REPLACE FUNCTION nearby_quests(
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION DEFAULT 25,
  search_keyword TEXT DEFAULT NULL
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
  country_code    TEXT,
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
    q.created_at, q.updated_at, q.country_code,
    ST_Y(q.geog::geometry) AS lat,
    ST_X(q.geog::geometry) AS lng,
    ST_Distance(q.geog, ST_Point(user_lng, user_lat)::geography) / 1000.0 AS distance_km
  FROM quests q
  WHERE ST_DWithin(q.geog, ST_Point(user_lng, user_lat)::geography, radius_km * 1000)
    AND q.starts_at >= now()
    AND (
      search_keyword IS NULL
      OR to_tsvector('english', q.title || ' ' || q.description) @@ plainto_tsquery('english', search_keyword)
    )
  ORDER BY
    CASE WHEN search_keyword IS NOT NULL
      THEN ts_rank(to_tsvector('english', q.title || ' ' || q.description), plainto_tsquery('english', search_keyword))
      ELSE 0
    END DESC,
    distance_km ASC;
END;
$$ LANGUAGE plpgsql;

-- 2. New national_quests() function for country-wide search
CREATE OR REPLACE FUNCTION national_quests(
  user_country TEXT,
  user_lat DOUBLE PRECISION DEFAULT NULL,
  user_lng DOUBLE PRECISION DEFAULT NULL,
  search_keyword TEXT DEFAULT NULL
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
  country_code    TEXT,
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
    q.created_at, q.updated_at, q.country_code,
    ST_Y(q.geog::geometry) AS lat,
    ST_X(q.geog::geometry) AS lng,
    CASE
      WHEN user_lat IS NOT NULL AND user_lng IS NOT NULL
      THEN ST_Distance(q.geog, ST_Point(user_lng, user_lat)::geography) / 1000.0
      ELSE 0
    END AS distance_km
  FROM quests q
  WHERE (q.country_code = UPPER(user_country) OR q.country_code = user_country)
    AND q.starts_at >= now()
    AND (
      search_keyword IS NULL
      OR to_tsvector('english', q.title || ' ' || q.description) @@ plainto_tsquery('english', search_keyword)
    )
  ORDER BY
    CASE WHEN search_keyword IS NOT NULL
      THEN ts_rank(to_tsvector('english', q.title || ' ' || q.description), plainto_tsquery('english', search_keyword))
      ELSE 0
    END DESC,
    (CASE
      WHEN user_lat IS NOT NULL AND user_lng IS NOT NULL
      THEN ST_Distance(q.geog, ST_Point(user_lng, user_lat)::geography) / 1000.0
      ELSE 0
    END) ASC;
END;
$$ LANGUAGE plpgsql;
```

## Step 3: Run the Query

Click the **Run** button (or press Cmd+Enter / Ctrl+Enter).

You should see ✓ success messages for each statement.

## Step 4: Test

After running the SQL:
1. Push code changes: `git add . && git commit -m "Add keyword search UI + national quests"`
2. Deploy to Vercel or your hosting
3. Open the app and try searching:
   - Type "permaculture" → filters to permaculture events
   - Type "repair" → filters to repair cafés/workshops
   - Type "yoga" → filters to yoga/wellness sessions

## What Changed

- ✅ Added `country_code` column to quests table
- ✅ Created full-text search index for title + description
- ✅ Enhanced `nearby_quests()` RPC with keyword search parameter
- ✅ Added `national_quests()` RPC for country-wide discovery
- ✅ Added keyword search input in the UI

## Features Now Working

- **Radius filter**: 2km walking / 10km cycling / 25km driving / 50km regional / National
- **Time filter**: Today / This week / All upcoming
- **Keyword search**: Search by activity type (permaculture, repair, yoga, sing, dance, compost, etc.)
- **Combined**: Search for "permaculture" near you + "national" for all permaculture events in your country
