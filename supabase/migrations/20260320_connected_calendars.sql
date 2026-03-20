-- Connected calendars table for Luma (and future platform) integrations
CREATE TABLE IF NOT EXISTS connected_calendars (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  platform text NOT NULL DEFAULT 'luma',
  api_key_encrypted text NOT NULL,
  organiser_name text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  last_synced_at timestamptz DEFAULT now(),
  UNIQUE(platform, api_key_encrypted)
);

-- Add source_name column to quests if it doesn't exist
ALTER TABLE quests ADD COLUMN IF NOT EXISTS source_name text;

-- RLS: service role can do everything, users can read their own
ALTER TABLE connected_calendars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON connected_calendars
  FOR ALL USING (true) WITH CHECK (true);
