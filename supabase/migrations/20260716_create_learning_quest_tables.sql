-- Quests (learning) section — Step 3.
-- Separate from the events `quests` table. RLS + grants mirror the
-- quest_participants pattern (content = public read, user rows = own only).

-- 1. learning_quests — quests within a petal (content)
create table public.learning_quests (
  id uuid primary key default gen_random_uuid(),
  petal_id text not null,
  title text not null,
  description text not null,
  order_index int not null default 0,
  xp_reward int not null default 50,
  created_at timestamptz not null default now()
);
create index learning_quests_petal_idx on public.learning_quests(petal_id, order_index);

-- 2. quest_cards — learning cards for a quest (content)
create table public.quest_cards (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.learning_quests(id) on delete cascade,
  card_type text not null check (card_type in ('concept','challenge','reflection')),
  content jsonb not null default '{}'::jsonb,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
create index quest_cards_quest_idx on public.quest_cards(quest_id, order_index);

-- 3. user_quest_progress — per-user completion
create table public.user_quest_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id uuid not null references public.learning_quests(id) on delete cascade,
  completed_at timestamptz not null default now(),
  xp_earned int not null default 0,
  unique (user_id, quest_id)
);
create index user_quest_progress_user_idx on public.user_quest_progress(user_id);

-- 4. quest_journal — private reflection entries
create table public.quest_journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.quest_cards(id) on delete cascade,
  quest_id uuid references public.learning_quests(id) on delete cascade,
  entry text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, card_id)
);
create index quest_journal_user_idx on public.quest_journal(user_id);

-- ── RLS ──
alter table public.learning_quests enable row level security;
alter table public.quest_cards enable row level security;
alter table public.user_quest_progress enable row level security;
alter table public.quest_journal enable row level security;

-- content: public read; writes via service_role (bypasses RLS)
create policy "learning_quests public read" on public.learning_quests for select to anon, authenticated using (true);
create policy "quest_cards public read" on public.quest_cards for select to anon, authenticated using (true);

-- user_quest_progress: each user only their own rows
create policy "uqp select own" on public.user_quest_progress for select to authenticated using (auth.uid() = user_id);
create policy "uqp insert own" on public.user_quest_progress for insert to authenticated with check (auth.uid() = user_id);
create policy "uqp update own" on public.user_quest_progress for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "uqp delete own" on public.user_quest_progress for delete to authenticated using (auth.uid() = user_id);

-- quest_journal: each user only their own rows (private)
create policy "journal select own" on public.quest_journal for select to authenticated using (auth.uid() = user_id);
create policy "journal insert own" on public.quest_journal for insert to authenticated with check (auth.uid() = user_id);
create policy "journal update own" on public.quest_journal for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "journal delete own" on public.quest_journal for delete to authenticated using (auth.uid() = user_id);

-- ── Grants (RLS won't run without these) ──
grant select on public.learning_quests to anon, authenticated;
grant select on public.quest_cards to anon, authenticated;
grant select, insert, update, delete on public.user_quest_progress to authenticated;
grant select, insert, update, delete on public.quest_journal to authenticated;
grant all on public.learning_quests to service_role;
grant all on public.quest_cards to service_role;
grant all on public.user_quest_progress to service_role;
grant all on public.quest_journal to service_role;
