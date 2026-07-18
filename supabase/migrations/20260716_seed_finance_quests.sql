-- Seed the Finance & Economics petal — four quests grounded in Emerge's soul
-- thinkers: Kate Raworth (doughnut), Helena Norberg-Hodge (localisation),
-- degrowth (Schumacher/Hickel), and gift economies (Eisenstein / time banks).

insert into public.learning_quests (petal_id, title, description, order_index, xp_reward) values
 ('finance-economics', 'The Doughnut',        'A safe and just space between people''s needs and the planet''s limits.', 0, 50),
 ('finance-economics', 'Local Is the Future', 'Shorten the distance between production and consumption.', 1, 50),
 ('finance-economics', 'Beyond Growth',       'Enough, for everyone, for good — economics past endless growth.', 2, 50),
 ('finance-economics', 'Gift and Exchange',   'Economies built on relationship, not extraction.', 3, 50);

-- The Doughnut (order 0)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🍩","heading":"A safe and just space","body":"Kate Raworth redrew economics as a doughnut. The inner ring is the social foundation — the essentials no one should fall below: food, water, housing, health, education, a political voice. The outer ring is the ecological ceiling — the planetary boundaries we mustn't overshoot: a stable climate, living biodiversity, fresh water and more. Between them lies the safe and just space for humanity: an economy designed to meet everyone's needs within the means of a living planet, not to grow without end.","keyIdea":"The goal isn't growth — it's to thrive in the space between people's needs and the planet's limits."}$j$::jsonb, 0
from public.learning_quests where petal_id='finance-economics' and order_index=0;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"In Raworth's doughnut, what does the outer ring represent?","choices":[{"id":"ceiling","label":"The ecological ceiling — planetary boundaries we mustn't overshoot"},{"id":"foundation","label":"The social foundation everyone needs"},{"id":"gdp","label":"The target rate of GDP growth"},{"id":"rate","label":"The national interest rate"}],"answerId":"ceiling","explanation":"The outer ring is the ecological ceiling (the planetary boundaries); the inner ring is the social foundation. A healthy economy keeps humanity in the safe, just space between the two."}$j$::jsonb, 1
from public.learning_quests where petal_id='finance-economics' and order_index=0;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Think of your week. Where does your life risk overshooting the ecological ceiling — and where might it fall short of the social foundation?","placeholder":"I overshoot when… I fall short when…"}$j$::jsonb, 2
from public.learning_quests where petal_id='finance-economics' and order_index=0;

-- Local Is the Future (order 1)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🏘️","heading":"Shorten the distance","body":"A globalised economy moves goods and money across the world, hiding its true costs and cutting the threads between people and the things they depend on. Helena Norberg-Hodge calls the answer localisation: shortening the distance between production and consumption. Money spent with a local farmer, maker or shop circulates again and again in the community instead of leaking away to distant shareholders — and it rebuilds the relationships a healthy place is made of. Her film The Economics of Happiness makes the case.","keyIdea":"Every local exchange keeps both value and relationship close to home."}$j$::jsonb, 0
from public.learning_quests where petal_id='finance-economics' and order_index=1;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"You spend €20. Which choice keeps the most value circulating in your local community?","choices":[{"id":"farmer","label":"Vegetables from a nearby farmer at the market"},{"id":"mega","label":"An order from a global online megastore"},{"id":"chain","label":"An out-of-town supermarket chain"},{"id":"brand","label":"An imported brand at a chain store"}],"answerId":"farmer","explanation":"Money spent with a local, independent producer recirculates locally — paying nearby wages, suppliers and rent — instead of leaking out to distant owners. Economists call it the local multiplier effect."}$j$::jsonb, 1
from public.learning_quests where petal_id='finance-economics' and order_index=1;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Name one thing you buy regularly that you could source locally instead. What's stopping you, and what's one small step?","placeholder":"I could buy … locally by…"}$j$::jsonb, 2
from public.learning_quests where petal_id='finance-economics' and order_index=1;

-- Beyond Growth (order 2)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🌱","heading":"Enough is a destination","body":"An economy that must grow forever on a finite planet is a contradiction. Degrowth is the deliberate scaling-down of material and energy use in the richest economies — not recession, not poverty, but using less stuff while people live better: shorter working weeks, sharing, repairing, and enough for all. E.F. Schumacher called it 'small is beautiful'; Jason Hickel calls it 'less is more'. Success is measured in wellbeing, not GDP.","keyIdea":"Growth is a means, not a goal — the aim is enough, for everyone, for good."}$j$::jsonb, 0
from public.learning_quests where petal_id='finance-economics' and order_index=2;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"What does 'degrowth' actually mean?","choices":[{"id":"reduce","label":"Deliberately reducing material and energy use while improving wellbeing"},{"id":"recession","label":"An economic recession or crash"},{"id":"poorer","label":"Making everyone poorer"},{"id":"stop","label":"Stopping all economic activity"}],"answerId":"reduce","explanation":"Degrowth is a planned, equitable reduction of throughput in over-consuming economies — less material and energy, more wellbeing, care and free time. It is the opposite of an unplanned recession."}$j$::jsonb, 1
from public.learning_quests where petal_id='finance-economics' and order_index=2;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Where in your life is there already 'enough' — and where does the pull for 'more' run the show?","placeholder":"I have enough … / I chase more when…"}$j$::jsonb, 2
from public.learning_quests where petal_id='finance-economics' and order_index=2;

-- Gift and Exchange (order 3)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🎁","heading":"Economies of relationship","body":"Before money, communities ran on gift and reciprocity — and they still can. Charles Eisenstein's Sacred Economics reimagines money as a tool for connection rather than extraction. In practice: time banks where an hour of anyone's help equals an hour of another's, skill-shares, tool libraries, local currencies, and the simple gift. These weave trust and resilience that no market can buy — regeneration you can feel.","keyIdea":"A gift creates a bond that a transaction cannot."}$j$::jsonb, 0
from public.learning_quests where petal_id='finance-economics' and order_index=3;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"In a time bank, how is an hour of someone's help valued?","choices":[{"id":"equal","label":"Equally — one hour of any member's time equals one hour of another's"},{"id":"rate","label":"By the person's professional hourly rate"},{"id":"cash","label":"In national currency, and taxed"},{"id":"scarce","label":"By how scarce the skill is"}],"answerId":"equal","explanation":"Time banks value everyone's hour equally — a gardener's hour equals a lawyer's — which dissolves market hierarchy and builds mutual, reciprocal community."}$j$::jsonb, 1
from public.learning_quests where petal_id='finance-economics' and order_index=3;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"What skill or hour could you offer to a time bank or skill-share near you? What might you ask for in return?","placeholder":"I could offer… I'd love help with…"}$j$::jsonb, 2
from public.learning_quests where petal_id='finance-economics' and order_index=3;
