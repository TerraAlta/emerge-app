-- Switched the Quests flower to Holmgren's canonical 7 petals; the seeded
-- water quests now live under the Land & Nature Stewardship petal.
update public.learning_quests set petal_id = 'land-nature' where petal_id = 'water';
