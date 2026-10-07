-- Events disappeared from the list the moment they started (the search
-- functions filtered starts_at >= now()), so a 10:00–18:00 workshop vanished
-- at 10:00. Now an event stays listed until it ENDS if it's short (≤ 3 days).
-- Long-running items (year-long courses, season registrations — 17 of them
-- at the time) still drop off when they start, so they don't clutter "today".
-- Applied 2026-10-07 after a rolled-back test (London 109 → 109, GB 307 → 308).
-- Also pins search_path on both functions (security advisor).

CREATE OR REPLACE FUNCTION public.quest_is_listable(s timestamptz, e timestamptz)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT s >= now() OR (e IS NOT NULL AND e >= now() AND e - s <= interval '3 days')
$$;

CREATE OR REPLACE FUNCTION public.nearby_quests(user_lat double precision, user_lng double precision, radius_km double precision DEFAULT 25, search_keyword text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, title text, description text, category text, address text, starts_at timestamp with time zone, ends_at timestamp with time zone, source_url text, source_name text, ai_score smallint, ai_reasoning text, image_url text, max_participants integer, created_at timestamp with time zone, updated_at timestamp with time zone, country_code text, lat double precision, lng double precision, distance_km double precision)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  SELECT q.id, q.title, q.description, q.category, q.address, q.starts_at, q.ends_at, q.source_url, q.source_name,
    q.ai_score, q.ai_reasoning, q.image_url, q.max_participants, q.created_at, q.updated_at, q.country_code::text,
    ST_Y(q.geog::geometry) AS lat, ST_X(q.geog::geometry) AS lng,
    ST_Distance(q.geog, ST_Point(user_lng, user_lat)::geography) / 1000.0 AS distance_km
  FROM quests q
  WHERE ST_DWithin(q.geog, ST_Point(user_lng, user_lat)::geography, radius_km * 1000)
    AND public.quest_is_listable(q.starts_at, q.ends_at)
    AND (search_keyword IS NULL OR to_tsvector('english', q.title || ' ' || q.description) @@ plainto_tsquery('english', search_keyword))
  ORDER BY
    CASE WHEN search_keyword IS NOT NULL THEN ts_rank(to_tsvector('english', q.title || ' ' || q.description), plainto_tsquery('english', search_keyword)) ELSE 0 END DESC,
    distance_km ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.national_quests(user_country text, user_lat double precision DEFAULT NULL::double precision, user_lng double precision DEFAULT NULL::double precision, search_keyword text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, title text, description text, category text, address text, starts_at timestamp with time zone, ends_at timestamp with time zone, source_url text, source_name text, ai_score smallint, ai_reasoning text, image_url text, max_participants integer, created_at timestamp with time zone, updated_at timestamp with time zone, country_code text, lat double precision, lng double precision, distance_km double precision)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  SELECT q.id, q.title, q.description, q.category, q.address, q.starts_at, q.ends_at, q.source_url, q.source_name,
    q.ai_score, q.ai_reasoning, q.image_url, q.max_participants, q.created_at, q.updated_at, q.country_code::text,
    ST_Y(q.geog::geometry) AS lat, ST_X(q.geog::geometry) AS lng,
    CASE WHEN user_lat IS NOT NULL AND user_lng IS NOT NULL
      THEN ST_Distance(q.geog, ST_Point(user_lng, user_lat)::geography) / 1000.0 ELSE 0 END AS distance_km
  FROM quests q
  WHERE q.country_code = user_country::char(2)
    AND public.quest_is_listable(q.starts_at, q.ends_at)
    AND (search_keyword IS NULL OR to_tsvector('english', q.title || ' ' || q.description) @@ plainto_tsquery('english', search_keyword))
  ORDER BY
    CASE WHEN search_keyword IS NOT NULL THEN ts_rank(to_tsvector('english', q.title || ' ' || q.description), plainto_tsquery('english', search_keyword)) ELSE 0 END DESC,
    q.starts_at ASC;
END;
$function$;
