-- Per-source results of each pipeline run, so the Monday health check can
-- spot sources that go quiet, slices that never reported, and spend.
--
-- Written by scripts/run-network-slice.ts (one row per source, plus one
-- '__slice__' row carrying the slice's AI cost) and scripts/run-city-slice.ts
-- (the iMac Eventbrite job). Read by /api/cron/weekly-health.
-- Service role only: RLS on, no policies.

CREATE TABLE IF NOT EXISTS public.pipeline_source_runs (
  id             bigserial PRIMARY KEY,
  run_at         timestamptz NOT NULL DEFAULT now(),
  runner         text NOT NULL,          -- 'network 1/4', 'city 1/1', ...
  source         text NOT NULL,          -- fetcher name, or '__slice__'
  fetched        integer NOT NULL DEFAULT 0,
  already_stored integer NOT NULL DEFAULT 0,
  inserted       integer NOT NULL DEFAULT 0,
  filtered       integer NOT NULL DEFAULT 0,
  errors         integer NOT NULL DEFAULT 0,
  cost_usd       numeric(10, 4)          -- only on '__slice__' rows
);
CREATE INDEX IF NOT EXISTS pipeline_source_runs_run_at_idx ON public.pipeline_source_runs (run_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_source_runs_source_idx ON public.pipeline_source_runs (source, run_at DESC);
ALTER TABLE public.pipeline_source_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.pipeline_source_runs TO service_role;
GRANT USAGE ON SEQUENCE public.pipeline_source_runs_id_seq TO service_role;
