-- Seed the Water petal with two quests (Step 4 content).
-- Cards link to their quest by (petal_id, order_index) so no ids are hardcoded.

insert into public.learning_quests (petal_id, title, description, order_index, xp_reward) values
 ('land-nature', 'Water as Teacher',      'Before you move a single drop, learn to watch it.', 0, 50),
 ('land-nature', 'Reading the Landscape', 'Find the invisible lines the water already follows.', 1, 50);

-- Cards for "Water as Teacher" (order_index 0)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"💧","heading":"Water always finds the path of least resistance","body":"Water never fights the land — it reads it. Given any slope it will slide, pool, seep and carve along the lines of least resistance, revealing the shape of the ground better than any map. In permaculture the first move is never to dig; it is to watch where water already wants to go.","keyIdea":"Observe before you intervene."}$j$::jsonb, 0
from public.learning_quests where petal_id='land-nature' and order_index=0;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"On a gentle slope, which action harvests rainwater most effectively?","choices":[{"id":"swale","label":"Dig a swale on contour"},{"id":"bed","label":"Build a raised bed"},{"id":"channel","label":"Pour a concrete channel"},{"id":"pipe","label":"Lay an irrigation pipe"}],"answerId":"swale","explanation":"A swale — a shallow ditch dug level along the contour — catches runoff and lets it soak slowly into the hillside, recharging the soil instead of rushing it away."}$j$::jsonb, 1
from public.learning_quests where petal_id='land-nature' and order_index=0;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Where does water move on your land or local area after rain? Picture the last downpour and follow it.","placeholder":"After heavy rain, the water in my area tends to…"}$j$::jsonb, 2
from public.learning_quests where petal_id='land-nature' and order_index=0;

-- Cards for "Reading the Landscape" (order_index 1)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🗺️","heading":"Keyline design & contour mapping","body":"Every landscape has a hidden geometry: ridgelines that shed water and valleys that gather it, joined by the \"keypoint\" where a slope changes pitch. Keyline design maps these contours and places earthworks along them, spreading water outward from the wet valleys toward the dry ridges.","keyIdea":"Water follows contour — design with the land’s own lines."}$j$::jsonb, 0
from public.learning_quests where petal_id='land-nature' and order_index=1;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"arrange","prompt":"Order these features as water meets them, from ridge to valley.","fromLabel":"Ridge (top)","toLabel":"Valley (bottom)","items":[{"id":"ridgeline","label":"Ridgeline"},{"id":"keypoint","label":"Keypoint"},{"id":"swale","label":"Contour swale"},{"id":"dam","label":"Valley dam"}],"explanation":"Water starts high on the ridgeline, gathers speed to the keypoint where the slope eases, is slowed and spread by a contour swale, and finally collects behind a dam in the valley."}$j$::jsonb, 1
from public.learning_quests where petal_id='land-nature' and order_index=1;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Sketch or describe the water flows you observed this week — where it gathered, where it ran dry.","placeholder":"This week I noticed water…"}$j$::jsonb, 2
from public.learning_quests where petal_id='land-nature' and order_index=1;
