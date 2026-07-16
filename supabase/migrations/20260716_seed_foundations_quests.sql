-- Seed the Foundations centre (petal_id 'ethics') with three quests:
-- The Three Ethics, Designing with Principles, and Reading Patterns
-- (pattern understanding lives here, per Holmgren's centre + Mollison's emphasis).

insert into public.learning_quests (petal_id, title, description, order_index, xp_reward) values
 ('ethics', 'The Three Ethics',          'Earth care, people care, fair share — the one root.', 0, 50),
 ('ethics', 'Designing with Principles', 'Twelve thinking tools for designing like an ecosystem.', 1, 50),
 ('ethics', 'Reading Patterns',          'See the whole pattern before you place the parts.', 2, 50);

-- Cards for "The Three Ethics" (order_index 0)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🌍","heading":"Earth care, people care, fair share","body":"Permaculture rests on three ethics, and every design is judged against them. Earth care — protect and regenerate living soils, waters and species. People care — meet real human needs and build self-reliant, connected communities. Fair share — take only what you need, and return the surplus of time, energy and resources back to the earth and to people. They aren't slogans; they're the filter every decision passes through.","keyIdea":"Ask of any design: does it care for the earth, care for people, and share fairly?"}$j$::jsonb, 0
from public.learning_quests where petal_id='ethics' and order_index=0;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"A grower has a large apple surplus every year and lets most of it rot rather than share, sell or preserve it. Which ethic is most neglected?","choices":[{"id":"earth","label":"Earth care"},{"id":"people","label":"People care"},{"id":"fair","label":"Fair share"},{"id":"none","label":"None — it's their harvest"}],"answerId":"fair","explanation":"Fair share means returning your surplus — food, time, skills — back to the earth and community rather than hoarding or wasting it. Letting abundance rot is the clearest breach."}$j$::jsonb, 1
from public.learning_quests where petal_id='ethics' and order_index=0;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Which of the three ethics comes hardest to you in practice — and where do you feel that friction?","placeholder":"The ethic I find hardest is…"}$j$::jsonb, 2
from public.learning_quests where petal_id='ethics' and order_index=0;

-- Cards for "Designing with Principles" (order_index 1)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🧩","heading":"Twelve principles, one design lens","body":"David Holmgren distilled permaculture into twelve design principles — thinking tools, not rules. A few: observe and interact; catch and store energy; obtain a yield; apply self-regulation and accept feedback; produce no waste; design from patterns to details; use edges and value the marginal; creatively use and respond to change. You don't memorise them like laws — you hold them up to a design and let them ask better questions.","keyIdea":"Principles don't tell you what to build — they ask better questions about what you're building."}$j$::jsonb, 0
from public.learning_quests where petal_id='ethics' and order_index=1;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"A gardener spends the first season mostly watching how sun, water and wind move across a new plot before planting anything. Which principle is this?","choices":[{"id":"observe","label":"Observe and interact"},{"id":"yield","label":"Obtain a yield"},{"id":"store","label":"Catch and store energy"},{"id":"waste","label":"Produce no waste"}],"answerId":"observe","explanation":"Observe and interact — the first principle. Patient observation of a place reveals what it wants to do, so your design works with it rather than against it."}$j$::jsonb, 1
from public.learning_quests where petal_id='ethics' and order_index=1;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Pick one of the twelve principles to carry into this week. Which one, and what will you try?","placeholder":"This week I'll practise…"}$j$::jsonb, 2
from public.learning_quests where petal_id='ethics' and order_index=1;

-- Cards for "Reading Patterns" (order_index 2)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🌀","heading":"From pattern to detail","body":"Nature reuses a small family of patterns: spirals (shells, herb spirals), branching (rivers, trees, lungs), nets and tessellations, lobes and edges, waves. Bill Mollison taught designers to read these first — design from pattern to detail. Grasp the big organising pattern of a place before you place any single element. Skip that step and the details never quite fit.","keyIdea":"Read the whole pattern before you place the parts."}$j$::jsonb, 0
from public.learning_quests where petal_id='ethics' and order_index=2;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"arrange","prompt":"Order these design steps the way Mollison teaches — from the whole pattern down to fine detail.","fromLabel":"Whole pattern","toLabel":"Fine detail","items":[{"id":"read","label":"Read the land's water, sun & wind patterns"},{"id":"zones","label":"Set the main zones and access ways"},{"id":"place","label":"Place beds, structures & water stores"},{"id":"plants","label":"Choose the individual plants"}],"explanation":"Design from pattern to detail: understand the big organising patterns first, then work down to specifics. Jumping straight to plant choice before reading the site is the commonest beginner mistake."}$j$::jsonb, 1
from public.learning_quests where petal_id='ethics' and order_index=2;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Find one pattern in your local landscape this week — a branching path, a spiral shell, an edge where two habitats meet. Where does it repeat?","placeholder":"I noticed the pattern of…"}$j$::jsonb, 2
from public.learning_quests where petal_id='ethics' and order_index=2;
