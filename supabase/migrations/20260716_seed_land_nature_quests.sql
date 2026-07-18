-- Deepen the Land & Nature Stewardship petal: living soil, food-forest layers,
-- and seeds as commons (Vandana Shiva / Navdanya — from the soul document).

insert into public.learning_quests (petal_id, title, description, order_index, xp_reward) values
 ('land-nature', 'Living Soil',      'The ground is alive — feed the life, not the plant.', 2, 50),
 ('land-nature', 'The Seven Layers', 'Stack a forest and one patch does the work of many.', 3, 50),
 ('land-nature', 'Seeds Are Commons','Seed is the commons of life, not a product.', 4, 50);

-- Living Soil (order_index 2)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🪱","heading":"Soil is alive","body":"A teaspoon of healthy soil holds more living organisms than there are people on Earth — bacteria, fungi, nematodes, earthworms — all trading nutrients in a web. Plants feed sugars to this web through their roots and get minerals and protection in return. The permaculture move is to feed the life, not the plant: mulch, compost and living roots build soil, while tillage and synthetic fertiliser strip it. Living soil grows healthy food and holds water like a sponge.","keyIdea":"Feed the soil life, and the soil will feed the plants."}$j$::jsonb, 0
from public.learning_quests where petal_id='land-nature' and order_index=2;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"Which practice best builds living soil over time?","choices":[{"id":"mulch","label":"Mulching and adding compost"},{"id":"till","label":"Deep tilling every season"},{"id":"npk","label":"Applying synthetic NPK fertiliser"},{"id":"bare","label":"Leaving soil bare between crops"}],"answerId":"mulch","explanation":"Mulch and compost feed the soil food web and shelter it. Tilling and bare soil expose and destroy that life, and synthetic fertiliser feeds the plant while starving the biology that makes soil fertile."}$j$::jsonb, 1
from public.learning_quests where petal_id='land-nature' and order_index=2;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Dig a handful of soil somewhere near you. What does it smell like, hold together like, and what lives in it?","placeholder":"The soil I found was…"}$j$::jsonb, 2
from public.learning_quests where petal_id='land-nature' and order_index=2;

-- The Seven Layers (order_index 3)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🌳","heading":"A forest in seven layers","body":"A food forest copies the structure of a young woodland, stacking useful plants into vertical layers so every niche of light and root-space is used: canopy trees, lower understorey trees, shrubs, herbaceous plants, ground covers, a root layer below, and vines climbing through it all. More layers means more yield from the same ground — and a system that increasingly mulches and feeds itself.","keyIdea":"Stack plants in layers and one patch of ground does the work of many."}$j$::jsonb, 0
from public.learning_quests where petal_id='land-nature' and order_index=3;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"arrange","prompt":"Stack these food-forest layers from the tallest canopy down to the ground.","fromLabel":"Canopy (top)","toLabel":"Ground (bottom)","items":[{"id":"canopy","label":"Canopy tree"},{"id":"understorey","label":"Understorey tree"},{"id":"shrub","label":"Shrub"},{"id":"herb","label":"Herbaceous layer"},{"id":"ground","label":"Ground cover"}],"explanation":"Canopy, understorey, shrub, herb and ground-cover layers fill the vertical space. Below them a root layer works the soil and vines climb through — seven layers in all."}$j$::jsonb, 1
from public.learning_quests where petal_id='land-nature' and order_index=3;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Look at a park, hedge or garden near you. How many of the layers can you spot? What's missing?","placeholder":"In my local green space I could see…"}$j$::jsonb, 2
from public.learning_quests where petal_id='land-nature' and order_index=3;

-- Seeds Are Commons (order_index 4)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🌾","heading":"Seeds are the commons of life","body":"For ten thousand years farmers saved seed, adapted it to their place, and shared it freely — seed was a commons, not a product. Vandana Shiva's Navdanya network has built over 150 community seed banks across India to defend that commons against patented, uniform, chemical-dependent seed. Saving open-pollinated seed keeps varieties alive, adapts them to your climate each year, and keeps food sovereignty in community hands rather than corporate ones.","keyIdea":"To save a seed is to keep the future open."}$j$::jsonb, 0
from public.learning_quests where petal_id='land-nature' and order_index=4;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"Why does saving open-pollinated seed matter most for food sovereignty?","choices":[{"id":"adapt","label":"It adapts to your place and stays in community hands"},{"id":"yield","label":"It always out-yields every other seed"},{"id":"nosoil","label":"It removes the need for any soil care"},{"id":"patent","label":"It is patented and protected"}],"answerId":"adapt","explanation":"Open-pollinated seed can be saved and re-sown, adapting to local conditions year on year and keeping seed — and the food system — a shared commons rather than a corporate product. Hybrid and patented seed can't be reliably saved."}$j$::jsonb, 1
from public.learning_quests where petal_id='land-nature' and order_index=4;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Find a seed swap, seed library, or one plant you could save seed from this season. What would you start with?","placeholder":"One seed I'd save is…"}$j$::jsonb, 2
from public.learning_quests where petal_id='land-nature' and order_index=4;
