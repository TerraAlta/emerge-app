-- Support tickets: user-submitted bug reports and feature suggestions
-- Run this in the Supabase SQL editor for the Emerge project (jxkbblstaqstwutmrdaf)

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  type text not null check (type in ('bug', 'suggestion')),
  title text not null,
  description text not null,
  page_url text,
  user_agent text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'wont_fix')),
  triage_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists support_tickets_status_idx on public.support_tickets(status, created_at desc);
create index if not exists support_tickets_user_idx on public.support_tickets(user_id, created_at desc);

alter table public.support_tickets enable row level security;

grant select, insert on public.support_tickets to authenticated;
grant all on public.support_tickets to service_role;

-- Authenticated users can submit tickets for themselves
create policy "Authenticated users can submit support tickets"
  on public.support_tickets for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can read their own tickets
create policy "Users can read own support tickets"
  on public.support_tickets for select
  to authenticated
  using (auth.uid() = user_id);

-- Triage (update/delete) happens via service role, not client
