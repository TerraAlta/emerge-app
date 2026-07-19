-- Seed the Governance & Community petal — the commons (Ostrom), deciding
-- together (sociocracy/NVC), and rights of nature (Polly Higgins — soul doc).

insert into public.learning_quests (petal_id, title, description, order_index, xp_reward) values
 ('governance-community', 'Governing the Commons', 'Communities can steward shared resources — and do.', 0, 50),
 ('governance-community', 'Deciding Together',     'Ways to decide without domination.', 1, 50),
 ('governance-community', 'Rights of Nature',      'Giving the living world a legal voice.', 2, 50);

-- Governing the Commons (order 0)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🌾","heading":"The commons can work","body":"We're often told the 'tragedy of the commons' means shared resources are always ruined by selfishness — so they must be privatised or policed from above. Elinor Ostrom won a Nobel Prize for showing this is wrong. Around the world, communities have governed shared forests, fisheries, water and pastures sustainably for centuries — when the people who use a resource make and monitor the rules together, with clear boundaries and fair ways to resolve conflict.","keyIdea":"Commons thrive when the community that depends on them governs them."}$j$::jsonb, 0
from public.learning_quests where petal_id='governance-community' and order_index=0;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"Elinor Ostrom showed that shared resources are best managed by…","choices":[{"id":"community","label":"The community that uses them, with rules they make and monitor together"},{"id":"private","label":"Always privatising them"},{"id":"state","label":"Top-down state control alone"},{"id":"nobody","label":"Leaving them completely unmanaged"}],"answerId":"community","explanation":"Ostrom's research found that self-organised communities — with clear boundaries, shared rules, monitoring and conflict resolution — can steward commons sustainably, without needing privatisation or purely top-down control."}$j$::jsonb, 1
from public.learning_quests where petal_id='governance-community' and order_index=0;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Think of a commons near you — a shared garden, woodland, hall or water source. Who cares for it, and how are its rules decided?","placeholder":"A commons near me is… tended by…"}$j$::jsonb, 2
from public.learning_quests where petal_id='governance-community' and order_index=0;

-- Deciding Together (order 1)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🗣️","heading":"Beyond bosses and ballots","body":"Majority votes leave a losing half; top-down bosses leave everyone else out. Sociocracy and consent-based decision-making offer another way: a proposal moves ahead when no one has a reasoned, paramount objection — so decisions are good enough for now and safe enough to try, and everyone's concerns are genuinely heard. Small circles hold clear domains and link together. Beneath it all, Nonviolent Communication (Marshall Rosenberg) tends the relationships that make any of it possible.","keyIdea":"Good decisions aren't about winning the vote — they're about no one being overruled unheard."}$j$::jsonb, 0
from public.learning_quests where petal_id='governance-community' and order_index=1;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"In consent-based (sociocratic) decision-making, a proposal passes when…","choices":[{"id":"noobjection","label":"No one has a reasoned, paramount objection"},{"id":"majority","label":"A bare majority votes yes"},{"id":"leader","label":"The leader decides"},{"id":"unanimous","label":"Everyone is fully enthusiastic"}],"answerId":"noobjection","explanation":"Consent isn't unanimous agreement or majority rule — a proposal proceeds when there is no reasoned, paramount objection: good enough for now, safe enough to try, with all concerns heard."}$j$::jsonb, 1
from public.learning_quests where petal_id='governance-community' and order_index=1;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Think of a group you're part of — family, work, a project. How does it really make decisions, and who tends to go unheard?","placeholder":"In my group, decisions get made by…"}$j$::jsonb, 2
from public.learning_quests where petal_id='governance-community' and order_index=1;

-- Rights of Nature (order 2)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"⚖️","heading":"A legal voice for the living world","body":"Our laws mostly treat nature as property — something to be owned, used and damaged, with only humans holding rights. A growing movement is changing that: Ecuador wrote the rights of nature into its constitution, and New Zealand granted the Whanganui River legal personhood, with human guardians who speak for it. Polly Higgins — one of Emerge's guiding lights — gave her career to making ecocide, the mass destruction of ecosystems, a crime under international law. Governance, it turns out, isn't only for humans.","keyIdea":"When a river can have rights, the whole idea of who counts begins to change."}$j$::jsonb, 0
from public.learning_quests where petal_id='governance-community' and order_index=2;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"What did Polly Higgins campaign to establish?","choices":[{"id":"ecocide","label":"Ecocide — mass damage to ecosystems — as an international crime"},{"id":"tax","label":"Lower taxes for green businesses"},{"id":"parks","label":"More national parks"},{"id":"carbon","label":"A global carbon market"}],"answerId":"ecocide","explanation":"Polly Higgins worked to make ecocide — serious, widespread destruction of ecosystems — a crime under international law, giving the living world legal protection."}$j$::jsonb, 1
from public.learning_quests where petal_id='governance-community' and order_index=2;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Picture a river, forest or hillside near you. If it could speak in court, what would it ask for — and who would you trust to be its guardian?","placeholder":"The place I'd speak for is…"}$j$::jsonb, 2
from public.learning_quests where petal_id='governance-community' and order_index=2;
