-- Add the 'action' (field quest) card type and seed a few onto existing quests.

alter table public.quest_cards drop constraint if exists quest_cards_card_type_check;
alter table public.quest_cards add constraint quest_cards_card_type_check
  check (card_type in ('concept','challenge','reflection','action'));

-- Seeds Are Commons (land-nature, quest order 4) → action card at order 3
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'action', $j${"icon":"🌱","heading":"Save a seed, join the commons","body":"Knowing about seed sovereignty is one thing — keeping a seed alive is another. This is where the idea becomes a living act.","action":"Find a seed swap or seed library near you and go — or save seed from one open-pollinated plant this season and label it.","placeholder":"The seed or swap I'll start with…"}$j$::jsonb, 3
from public.learning_quests where petal_id='land-nature' and order_index=4;

-- Repair, Don't Replace (tools-materials, quest order 0) → action card at order 3
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'action', $j${"icon":"🔧","heading":"Mend one thing","body":"The fastest way to break throwaway culture is to fix something with your own hands.","action":"This week, take one broken item to a local repair café — or mend it yourself and notice how it feels.","placeholder":"The thing I'll mend…"}$j$::jsonb, 3
from public.learning_quests where petal_id='tools-materials' and order_index=0;

-- Nature Is Not Optional (health-wellbeing, quest order 0) → action card at order 3
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'action', $j${"icon":"🌳","heading":"Twenty minutes among trees","body":"The science only matters if your body feels it. Give it the chance.","action":"This week, spend twenty unhurried minutes among trees with your phone away. Just be there.","placeholder":"Where and when I'll go…"}$j$::jsonb, 3
from public.learning_quests where petal_id='health-wellbeing' and order_index=0;
