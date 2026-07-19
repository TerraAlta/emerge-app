-- Seed the Health & Wellbeing petal — nature connection, community care, and
-- ecological resilience (Louv, Macnamara, Joanna Macy's Work That Reconnects).

insert into public.learning_quests (petal_id, title, description, order_index, xp_reward) values
 ('health-wellbeing', 'Nature Is Not Optional', 'A body regulates itself in living systems.', 0, 50),
 ('health-wellbeing', 'The Web of Care',        'We heal in relationship, not alone.', 1, 50),
 ('health-wellbeing', 'Active Hope',            'Staying whole while loving a wounded world.', 2, 50);

-- Nature Is Not Optional (order 0)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🌲","heading":"Health is ecological, not just personal","body":"For nearly all of human history we lived embedded in living systems — and our bodies still expect it. Cut off from nature, stress, anxiety and illness rise; Richard Louv named the pattern 'nature-deficit disorder'. The reverse is measurable: unhurried time among trees — the Japanese practice of shinrin-yoku, forest bathing — is linked to lower stress hormones, blood pressure and rumination. Health was never only personal.","keyIdea":"Time in living systems isn't a luxury — it's how a body regulates itself."}$j$::jsonb, 0
from public.learning_quests where petal_id='health-wellbeing' and order_index=0;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"What is shinrin-yoku?","choices":[{"id":"forest","label":"Forest bathing — slow, mindful time among trees"},{"id":"diet","label":"A Japanese diet plan"},{"id":"yoga","label":"A style of hot yoga"},{"id":"herb","label":"A herbal supplement"}],"answerId":"forest","explanation":"Shinrin-yoku, 'forest bathing', is calmly being present among trees. Studies link it to lower cortisol, blood pressure and stress."}$j$::jsonb, 1
from public.learning_quests where petal_id='health-wellbeing' and order_index=0;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"When did you last spend unhurried time in nature, with no goal? How did your body and mind feel afterwards?","placeholder":"The last time I was truly in nature…"}$j$::jsonb, 2
from public.learning_quests where petal_id='health-wellbeing' and order_index=0;

-- The Web of Care (order 1)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🤲","heading":"We heal in relationship","body":"Wellbeing is not a solo project. We heal held by people who notice when we're struggling and share the load. The people-care ethic and social permaculture (Looby Macnamara's People and Permaculture) treat community as an ecosystem to tend: care circles, mutual aid, cooking for a neighbour, sitting with someone's grief. Isolation is one of the great health risks of our age; a strong web of care is one of the great protections.","keyIdea":"Resilience isn't how tough you are alone — it's how well you're held."}$j$::jsonb, 0
from public.learning_quests where petal_id='health-wellbeing' and order_index=1;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"Which best builds real community resilience?","choices":[{"id":"circle","label":"A neighbourhood mutual-aid and care circle"},{"id":"app","label":"A paid meditation-app subscription"},{"id":"retreat","label":"A single annual wellness retreat"},{"id":"follow","label":"Following more wellness influencers"}],"answerId":"circle","explanation":"Ongoing, reciprocal, face-to-face care between neighbours builds durable resilience — the kind no product or one-off event can replace."}$j$::jsonb, 1
from public.learning_quests where petal_id='health-wellbeing' and order_index=1;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Who is in your web of care — the people you'd call at 2am, and who'd call you? Where is it thin?","placeholder":"My web of care includes…"}$j$::jsonb, 2
from public.learning_quests where petal_id='health-wellbeing' and order_index=1;

-- Active Hope (order 2)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"💚","heading":"Hope you can practise","body":"How do you stay whole while loving a wounded world? Joanna Macy's Active Hope and the Work That Reconnects offer a path that neither numbs out nor drowns in despair. It moves in a spiral: begin from gratitude, then honour the pain we feel for the world rather than bury it, then see with new eyes that we belong to a larger living whole — and from there, go forth into action. Hope becomes something you do, not something you wait to feel.","keyIdea":"Active hope isn't optimism — it's choosing to act for what you love, whatever the odds."}$j$::jsonb, 0
from public.learning_quests where petal_id='health-wellbeing' and order_index=2;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"arrange","prompt":"Order the four movements of Joanna Macy's 'Work That Reconnects' spiral.","fromLabel":"Begin","toLabel":"Go forth","items":[{"id":"gratitude","label":"Come from gratitude"},{"id":"pain","label":"Honour our pain for the world"},{"id":"eyes","label":"See with new eyes"},{"id":"forth","label":"Go forth into action"}],"explanation":"Gratitude grounds us; honouring our pain lets us feel rather than numb; seeing with new eyes reveals our belonging to the living whole; and from there we go forth to act — then the spiral turns again."}$j$::jsonb, 1
from public.learning_quests where petal_id='health-wellbeing' and order_index=2;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"What loss do you carry about the living world — and what do you love enough to act for anyway?","placeholder":"I grieve… I'll act for…"}$j$::jsonb, 2
from public.learning_quests where petal_id='health-wellbeing' and order_index=2;
