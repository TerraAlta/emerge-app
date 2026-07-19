-- Seed the Tools & Materials petal — repair culture, the circular economy,
-- and sharing (libraries of things).

insert into public.learning_quests (petal_id, title, description, order_index, xp_reward) values
 ('tools-materials', 'Repair, Don''t Replace', 'Fixing things saves resources and builds skill.', 0, 50),
 ('tools-materials', 'Waste Is a Resource',   'In nature nothing is thrown away.', 1, 50),
 ('tools-materials', 'The Library of Things', 'Share what mostly sits idle.', 2, 50);

-- Repair, Don't Replace (order 0)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🔧","heading":"Fixing is a radical act","body":"Throwaway culture treats a broken toaster as rubbish and a reason to buy another. But most things can be mended — and mending saves the materials, energy and money locked inside them, while keeping skills alive. Repair Cafés, first started in Amsterdam, are free community events where people bring broken things and fix them together with volunteer menders. It's the 'produce no waste' principle, done with a screwdriver and a cup of tea.","keyIdea":"A repaired thing is worth more than a new one — it carries skill and story."}$j$::jsonb, 0
from public.learning_quests where petal_id='tools-materials' and order_index=0;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"What happens at a Repair Café?","choices":[{"id":"fix","label":"People bring broken items and fix them together with volunteer helpers"},{"id":"coffee","label":"It's simply a coffee shop"},{"id":"buy","label":"You buy refurbished electronics"},{"id":"recycle","label":"You drop off items to be recycled"}],"answerId":"fix","explanation":"A Repair Café is a free community event where volunteer menders help you fix broken things — keeping items in use, passing on skills and building community."}$j$::jsonb, 1
from public.learning_quests where petal_id='tools-materials' and order_index=0;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"What's one broken thing you've been meaning to deal with? Could it be repaired instead of replaced — by you, or with help?","placeholder":"Something I could repair is…"}$j$::jsonb, 2
from public.learning_quests where petal_id='tools-materials' and order_index=0;

-- Waste Is a Resource (order 1)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"♻️","heading":"There is no 'away'","body":"In a forest, nothing is wasted — every fallen leaf and dead thing becomes food for something else, cycling endlessly. Our economy runs the other way: extract, use once, discard. The circular economy, and the Cradle to Cradle design of McDonough and Braungart, asks us to design like nature: keep materials cycling as nutrients (biological ones that compost, technical ones that are reused), so 'waste' becomes food rather than landfill.","keyIdea":"Design so that everything becomes food for something else."}$j$::jsonb, 0
from public.learning_quests where petal_id='tools-materials' and order_index=1;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"What is the core idea of the circular economy?","choices":[{"id":"cycle","label":"Design so materials keep cycling as resources and never become waste"},{"id":"recycle","label":"Recycle a little more at the end"},{"id":"burn","label":"Burn waste to make energy"},{"id":"export","label":"Ship waste somewhere else"}],"answerId":"cycle","explanation":"A circular economy designs waste out from the start — materials are kept in use and cycled as biological or technical nutrients, mimicking how ecosystems have no waste. Recycling at the end is only a weak last resort."}$j$::jsonb, 1
from public.learning_quests where petal_id='tools-materials' and order_index=1;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Look at what you throw away in a week. Which 'waste' stream could actually be a resource — for you, a neighbour, or the soil?","placeholder":"One thing I throw away that could be a resource…"}$j$::jsonb, 2
from public.learning_quests where petal_id='tools-materials' and order_index=1;

-- The Library of Things (order 2)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"📚","heading":"Access, not ownership","body":"The average power drill is used for about fifteen minutes in its whole life, yet nearly every household owns one. A tool library or Library of Things lets a community share drills, ladders, sewing machines, camping gear — things that mostly sit idle. Less stuff gets made and stored, more people get access, and neighbours meet across the loan. Owning less, together, can mean having more.","keyIdea":"For things you rarely use, sharing beats owning — for the planet and the community."}$j$::jsonb, 0
from public.learning_quests where petal_id='tools-materials' and order_index=2;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"Why does a tool library reduce environmental impact?","choices":[{"id":"share","label":"Many people share a few tools, so far fewer need to be made"},{"id":"cheap","label":"Tools are made more cheaply"},{"id":"fast","label":"People use tools faster"},{"id":"new","label":"Everyone buys newer tools"}],"answerId":"share","explanation":"Shared tools are used far more of the time, so a community needs a fraction of the tools — cutting the materials, energy and waste of making and storing thousands of idle objects."}$j$::jsonb, 1
from public.learning_quests where petal_id='tools-materials' and order_index=2;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Name a tool or piece of kit you own but rarely use. Who nearby might share it — and what might you borrow instead of buy?","placeholder":"I could share… I'd rather borrow…"}$j$::jsonb, 2
from public.learning_quests where petal_id='tools-materials' and order_index=2;
