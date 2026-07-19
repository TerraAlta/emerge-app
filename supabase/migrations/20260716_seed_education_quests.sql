-- Seed the Education & Culture petal — learning by doing (Freire), ecological
-- literacy (David Orr), and story/culture (Robin Wall Kimmerer).

insert into public.learning_quests (petal_id, title, description, order_index, xp_reward) values
 ('education-culture', 'Learning by Doing',   'We learn the world by acting on it, not being told.', 0, 50),
 ('education-culture', 'Ecological Literacy', 'You can''t care well for a place you can''t read.', 1, 50),
 ('education-culture', 'Story as Seed',       'Change a people''s stories and you change how they treat the land.', 2, 50);

-- Learning by Doing (order 0)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"✋","heading":"Learning is doing, together","body":"Paulo Freire called the dominant model of schooling the 'banking model' — teachers making deposits of facts into students treated as empty accounts, to be memorised and repaid in exams. Real learning, he argued, is dialogue and action: we come to know the world by acting on it and reflecting together. Permaculture is taught hands-first for the same reason — you learn soil by digging it. Emerge is built on this: do something real, don't just scroll about it.","keyIdea":"We learn the world by acting on it — not by having it deposited into us."}$j$::jsonb, 0
from public.learning_quests where petal_id='education-culture' and order_index=0;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"Freire criticised the 'banking model' of education. What is it?","choices":[{"id":"deposit","label":"Treating students as empty accounts to deposit facts into"},{"id":"finance","label":"A course about personal finance"},{"id":"banks","label":"Learning how banks work"},{"id":"fees","label":"Charging tuition fees"}],"answerId":"deposit","explanation":"In the banking model, knowledge is 'deposited' into passive students. Freire argued instead for dialogic, problem-posing education where people learn by engaging and acting."}$j$::jsonb, 1
from public.learning_quests where petal_id='education-culture' and order_index=0;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Think of something you truly understand. Did you learn it by being told — or by doing? What did the doing teach that words couldn't?","placeholder":"I really learned … by…"}$j$::jsonb, 2
from public.learning_quests where petal_id='education-culture' and order_index=0;

-- Ecological Literacy (order 1)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"🌍","heading":"Reading the living world","body":"David Orr argues that all education is environmental education — by what it includes or ignores, it teaches us that we are either part of the living world or apart from it. Ecological literacy is the ability to read that world: knowing where your water comes from and where your waste goes, what grows in your region this month, which trees and birds are your neighbours. It's the grammar beneath every other regenerative skill.","keyIdea":"You can't care well for a place you can't read."}$j$::jsonb, 0
from public.learning_quests where petal_id='education-culture' and order_index=1;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"Which is a sign of ecological literacy?","choices":[{"id":"water","label":"Knowing where your tap water comes from and where your waste goes"},{"id":"index","label":"Memorising the stock-market index"},{"id":"cars","label":"Naming every luxury car brand"},{"id":"shows","label":"Knowing the top ten streaming shows"}],"answerId":"water","explanation":"Ecological literacy is practical knowledge of the living systems you depend on — watershed, food, seasons, local species — not abstract or commercial data."}$j$::jsonb, 1
from public.learning_quests where petal_id='education-culture' and order_index=1;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"Can you name your watershed, one bird that lives near you, and what food is in season right now? Which blanks would you most like to fill?","placeholder":"My watershed is… A local bird is… In season now…"}$j$::jsonb, 2
from public.learning_quests where petal_id='education-culture' and order_index=1;

-- Story as Seed (order 2)
insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'concept', $j${"icon":"📖","heading":"The stories we tell the land","body":"Cultures are held together by stories, and the stories we tell about nature shape how we treat it. Is the land a warehouse of resources, or a community of relatives we belong to? Robin Wall Kimmerer, in Braiding Sweetgrass, braids indigenous knowledge and science to tell the second story — the earth as gift and kin, met with gratitude and reciprocity. Changing a culture starts with changing its stories; a good story is a seed that grows for generations.","keyIdea":"Change the story a people tell about the land, and you change how they treat it."}$j$::jsonb, 0
from public.learning_quests where petal_id='education-culture' and order_index=2;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'challenge', $j${"kind":"multiple-choice","prompt":"In Braiding Sweetgrass, how does Kimmerer invite us to see the living world?","choices":[{"id":"kin","label":"As gift and kin, met with gratitude and reciprocity"},{"id":"property","label":"As property to be owned and traded"},{"id":"machine","label":"As a machine to be optimised"},{"id":"scenery","label":"As scenery for photographs"}],"answerId":"kin","explanation":"Kimmerer braids indigenous wisdom and botany to reframe nature as a web of relatives and gifts, calling for reciprocity rather than extraction."}$j$::jsonb, 1
from public.learning_quests where petal_id='education-culture' and order_index=2;

insert into public.quest_cards (quest_id, card_type, content, order_index)
select id, 'reflection', $j${"prompt":"What story from your family or culture shaped how you see land, food or a particular place? Is it one worth passing on?","placeholder":"A story I carry about place is…"}$j$::jsonb, 2
from public.learning_quests where petal_id='education-culture' and order_index=2;
