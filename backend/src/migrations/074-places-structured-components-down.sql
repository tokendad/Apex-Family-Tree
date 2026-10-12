-- Put the places table back the way migration 068 left it.
--
-- That means the components empty again and address_text holding the place's
-- own name, which is what 068 wrote and what the forward migration corrected.
-- Restoring a wrong value is the point of a down migration: it is 068's state,
-- not a good state.
--
-- The same reviewed list of 68 names, so only the rows the forward migration
-- touched are reverted. A place created afterwards through the structured form
-- keeps its components -- rolling a migration back must not empty columns that
-- somebody filled in by hand.
--
-- The 17 enclosing places are removed by the id prefix the forward migration
-- gave them, so a place that already existed under one of those names is left
-- alone, and one that has since been linked to an event or had a child place
-- attached stays too.

CREATE TEMP TABLE place_chain_revert (norm TEXT PRIMARY KEY);

INSERT INTO place_chain_revert (norm) VALUES
  ('1060 main st., worcester, massachusetts'),
  ('11178 culver blvd, apt 15, culver city, california 90230'),
  ('34 shattuck st., worcester, massachusetts'),
  ('40 eastern st., allston, massachusetts'),
  ('60 crestwood estates, vernon, windham, vermont 05354'),
  ('714 main st., worcester, massachusetts 01610'),
  ('auburn, massachusetts'),
  ('berthier, quebec, canada'),
  ('boca raton, florida'),
  ('boston, massachusetts'),
  ('bourne, massachusetts'),
  ('california'),
  ('cambridge cemetery, cambridge, massachusetts'),
  ('camp devens, massachusetts'),
  ('canada'),
  ('cottage ave., shrewsbury, massachusetts'),
  ('danielsonville, connecticut'),
  ('donna kay nursing home, worcester, massachusetts'),
  ('florida'),
  ('fort jay, governors island, new york'),
  ('granby, connecticut'),
  ('granby, quebec, canada'),
  ('hahnemann hospital, worcester, massachusetts'),
  ('holden, massachusetts'),
  ('hollywood, florida'),
  ('holy rosary & st. mary cemetery, spencer, massachusetts'),
  ('jensen beach, florida'),
  ('knollwood nursing center, worcester, massachusetts'),
  ('lakeside avenue, webster, massachusetts'),
  ('las vegas, nevada'),
  ('leicester, massachusetts'),
  ('leominster, massachusetts'),
  ('long island, new york'),
  ('marieville, quebec, canada'),
  ('marlborough, massachusetts'),
  ('massachusetts'),
  ('medical center of central massachusetts — hahnemann, worcester, massachusetts'),
  ('milton mills, new hampshire'),
  ('montréal, québec, canada'),
  ('moser river, nova scotia, canada'),
  ('northborough, massachusetts'),
  ('northbridge, massachusetts'),
  ('nova scotia, canada'),
  ('oxford, massachusetts'),
  ('pout and trout campground, 94 river rd, rutland, massachusetts'),
  ('publick house, sturbridge, massachusetts'),
  ('putnam, connecticut'),
  ('queens, new york'),
  ('quinebaug, connecticut'),
  ('shrewsbury, massachusetts'),
  ('south carolina'),
  ('springfield, massachusetts'),
  ('st. john''s cemetery, worcester, massachusetts'),
  ('st. rose rectory, northborough, massachusetts'),
  ('stickney brook, vermont'),
  ('sturbridge, massachusetts'),
  ('tuell nursing home, 92 franklin st., melrose, massachusetts'),
  ('umass memorial medical center — memorial campus, worcester, massachusetts'),
  ('uxbridge, massachusetts'),
  ('vernon, vermont'),
  ('ware, massachusetts'),
  ('webster, massachusetts'),
  ('westboro, massachusetts'),
  ('woonsocket, rhode island'),
  ('worcester county memorial park, paxton, massachusetts'),
  ('worcester, massachusetts'),
  ('york beach, maine'),
  ('york, maine');

UPDATE places SET
  place_type = NULL,
  locality = NULL,
  county = NULL,
  region = NULL,
  country = NULL,
  postal_code = NULL,
  parent_place_id = NULL,
  address_text = (SELECT ao.title FROM archive_objects ao WHERE ao.id = places.id)
WHERE normalized_name IN (SELECT norm FROM place_chain_revert);

-- Before deciding which ones are free: an enclosing place can sit under
-- another one -- Governors Island under New York -- and a parent that still
-- points at its own parent would otherwise look occupied and survive. Slacken
-- the chain between them first, so the only thing that can keep one of these
-- rows is a child place older than this migration.
UPDATE places SET parent_place_id = NULL WHERE id LIKE 'place_chain_%';

CREATE TEMP TABLE place_chain_drop AS
SELECT p.id
FROM places p
WHERE p.id LIKE 'place_chain_%'
  AND NOT EXISTS (SELECT 1 FROM relationship_members m WHERE m.object_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM places c WHERE c.parent_place_id = p.id);

-- Hand-ordered: the migrator runs with foreign_keys off, so ON DELETE CASCADE
-- does not fire and the child rows have to go first.
DELETE FROM place_aliases WHERE place_id IN (SELECT id FROM place_chain_drop);
DELETE FROM places WHERE id IN (SELECT id FROM place_chain_drop);
DELETE FROM archive_objects WHERE id IN (SELECT id FROM place_chain_drop);

DROP TABLE place_chain_drop;
DROP TABLE place_chain_revert;
