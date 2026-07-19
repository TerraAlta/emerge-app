-- Seed the Building & Technology petal — natural building, passive solar
-- design, and permaculture zones & sectors.

insert into public.learning_quests (petal_id, title, description, order_index, xp_reward) values
 ('building-technology', 'Build with the Earth', 'Shelter from local, low-impact, repairable materials.', 0, 50),
 ('building-technology', 'Design with the Sun',  'A good building barely needs heating or cooling.', 1, 50),
 ('building-technology', 'Zones and Sectors',    'Place things by how often you use them.', 2, 50);

-- Build with the Earth (order 0)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🧱","heading":"Shelter from the ground up","body":"Conventional building leans on concrete and steel — among the most carbon-heavy materials on Earth. Natural building reaches instead for local, low-impact materials: cob (a mix of clay, sand and straw), straw bale, timber, rammed earth, lime. These breathe, regulate humidity, can be repaired by hand, and return to the earth at the end of their life. They're also beautiful, and buildable by ordinary people together.","keyIdea":"The best building materials are often already under your feet."}$j$::jsonb, 0
from public.learning_quests where petal_id='building-technology' and order_index=0;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"Which is a natural building material?","choices":[{"id":"cob","label":"Cob — a mix of clay, sand and straw"},{"id":"concrete","label":"Reinforced concrete"},{"id":"pvc","label":"PVC cladding"},{"id":"eps","label":"Expanded polystyrene"}],"answerId":"cob","explanation":"Cob — clay, sand and straw — is a classic natural building material: local, low-carbon, breathable and hand-buildable. The others are high-embodied-energy industrial products."}$j$::jsonb, 1
from public.learning_quests where petal_id='building-technology' and order_index=0;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Have you ever touched a cob, straw-bale, timber or earthen building? How did the space feel compared to a concrete one?","placeholder":"A natural building I remember…"}$j$::jsonb, 2
from public.learning_quests where petal_id='building-technology' and order_index=0;

-- Design with the Sun (order 1)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"☀️","heading":"Let the climate do the work","body":"A well-designed building barely needs heating or cooling — it works with the sun instead of against it. Passive solar design orients the main glazing toward the midday sun to catch winter warmth, uses thermal mass (stone, earth, water) to store that heat and release it slowly, shades those windows from the high summer sun, and insulates well all round. This is the principle 'catch and store energy' made into walls.","keyIdea":"Design with sun, wind and season, and the building heats and cools itself."}$j$::jsonb, 0
from public.learning_quests where petal_id='building-technology' and order_index=1;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"In the northern hemisphere, which way should a home's main windows face to catch winter sun?","choices":[{"id":"south","label":"South"},{"id":"north","label":"North"},{"id":"east","label":"East"},{"id":"west","label":"West"}],"answerId":"south","explanation":"In the northern hemisphere the winter sun tracks across the south, so south-facing glazing (with summer shading and thermal mass) captures free warmth when it's needed most. (In the southern hemisphere, it's north.)"}$j$::jsonb, 1
from public.learning_quests where petal_id='building-technology' and order_index=1;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Watch how the sun moves around where you live over a day. Which rooms are warm and bright, which are cold and dark? What would you change?","placeholder":"The sun reaches my home…"}$j$::jsonb, 2
from public.learning_quests where petal_id='building-technology' and order_index=1;

-- Zones and Sectors (order 2)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🗺️","heading":"Place things by how often you use them","body":"Permaculture design uses zones to save endless walking and effort. Zone 0 is the home; zone 1 holds what you touch daily (salad leaves, herbs, the compost); further zones hold things you visit less — orchard and hens, then main crops and pasture, out to zone 5, wild land you mostly leave alone and observe. Sectors are the energies coming in from outside — sun, wind, water, noise — that you design to catch or deflect. Put the things you use most, closest.","keyIdea":"The things you tend most should be the fewest steps away."}$j$::jsonb, 0
from public.learning_quests where petal_id='building-technology' and order_index=2;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"arrange","prompt":"Order these from the zone you visit daily out to the one you rarely enter.","fromLabel":"Zone 0 (daily)","toLabel":"Zone 5 (rarely)","items":[{"id":"home","label":"Home & doorstep herbs"},{"id":"garden","label":"Kitchen garden"},{"id":"orchard","label":"Orchard & henhouse"},{"id":"fields","label":"Fields & pasture"},{"id":"wild","label":"Wild woodland"}],"explanation":"Zones ripple out from the home by how often you visit: doorstep herbs and salad closest, then the kitchen garden, orchard and animals, broad-acre fields, and finally the wild edge you mostly observe."}$j$::jsonb, 1
from public.learning_quests where petal_id='building-technology' and order_index=2;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Sketch your own zones — home, the spots you visit daily, weekly, rarely. Is anything you use often stuck too far away?","placeholder":"Right by my door is… Furthest away is…"}$j$::jsonb, 2
from public.learning_quests where petal_id='building-technology' and order_index=2;
