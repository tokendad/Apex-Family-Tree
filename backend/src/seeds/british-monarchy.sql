-- A demonstration family tree: the British royal line, Victoria to the present.
--
-- WHY THIS EXISTS. This repository is public, and the archive it was written
-- against is a real family. Developing against real family records meant that
-- every migration, test fixture and screenshot was personal data that could
-- not be committed, and the research migrations had to be kept out of the tree
-- entirely. This dataset replaces them for development: six generations of
-- people whose names, dates and places have been published for a century and
-- whose disputes are matters of public record.
--
-- IT IS NOT A MIGRATION, DELIBERATELY. A migration in src/migrations runs
-- automatically on every instance, including production, the moment the image
-- is pulled. Demo data must never do that. This file is applied on purpose, to
-- a database that is meant to receive it, and nothing runs it by itself.
--
-- WHAT IT EXERCISES. Every feature the person page has: multi-generation
-- descent and marriage, remarriage and divorce, living and deceased people,
-- places with coordinates, sources and citations, artifacts as evidence, and
-- claims at five different confidence levels. The research notes are written
-- in the capitalised-heading style the Research tab parses into sections, so
-- the sectioning and the claim anchors have something real to point at.
--
-- NO MINORS. The line stops at the adults. Every person here is either long
-- dead or a public adult; no child's details are in a dataset meant to be
-- published and screenshotted.
--
-- Ids are readable rather than random (`mon-victoria`), which makes this file
-- maintainable and makes it obvious at a glance that a row came from the demo
-- seed rather than from anybody's archive.
--
-- Every insert is guarded, so applying it twice changes nothing.

-- ─────────────────────────────────────────────────────────────────────────────
-- PLACES
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-pl-kensington', 'place', 'Kensington Palace, London', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-pl-kensington');
INSERT INTO places (id, normalized_name, place_type, locality, region, country, latitude, longitude)
SELECT 'mon-pl-kensington', 'kensington palace, london', 'building', 'London', 'England', 'United Kingdom', 51.5050, -0.1877
 WHERE NOT EXISTS (SELECT 1 FROM places WHERE id = 'mon-pl-kensington')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-pl-kensington');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-pl-buckingham', 'place', 'Buckingham Palace, London', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-pl-buckingham');
INSERT INTO places (id, normalized_name, place_type, locality, region, country, latitude, longitude)
SELECT 'mon-pl-buckingham', 'buckingham palace, london', 'building', 'London', 'England', 'United Kingdom', 51.5014, -0.1419
 WHERE NOT EXISTS (SELECT 1 FROM places WHERE id = 'mon-pl-buckingham')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-pl-buckingham');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-pl-windsor', 'place', 'Windsor Castle, Berkshire', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-pl-windsor');
INSERT INTO places (id, normalized_name, place_type, locality, region, country, latitude, longitude)
SELECT 'mon-pl-windsor', 'windsor castle, berkshire', 'building', 'Windsor', 'England', 'United Kingdom', 51.4839, -0.6044
 WHERE NOT EXISTS (SELECT 1 FROM places WHERE id = 'mon-pl-windsor')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-pl-windsor');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-pl-stgeorge', 'place', 'St George''s Chapel, Windsor Castle', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-pl-stgeorge');
INSERT INTO places (id, normalized_name, place_type, locality, region, country, latitude, longitude, notes)
SELECT 'mon-pl-stgeorge', 'st george''s chapel, windsor castle', 'church', 'Windsor', 'England', 'United Kingdom', 51.4839, -0.6064,
       'The burial place of ten sovereigns, and the parish church of the royal household in all but name. Both of the marriages and most of the interments in this archive happened here.'
 WHERE NOT EXISTS (SELECT 1 FROM places WHERE id = 'mon-pl-stgeorge')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-pl-stgeorge');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-pl-sandringham', 'place', 'Sandringham House, Norfolk', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-pl-sandringham');
INSERT INTO places (id, normalized_name, place_type, locality, region, country, latitude, longitude)
SELECT 'mon-pl-sandringham', 'sandringham house, norfolk', 'building', 'Sandringham', 'England', 'United Kingdom', 52.8306, 0.5147
 WHERE NOT EXISTS (SELECT 1 FROM places WHERE id = 'mon-pl-sandringham')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-pl-sandringham');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-pl-osborne', 'place', 'Osborne House, Isle of Wight', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-pl-osborne');
INSERT INTO places (id, normalized_name, place_type, locality, region, country, latitude, longitude)
SELECT 'mon-pl-osborne', 'osborne house, isle of wight', 'building', 'East Cowes', 'England', 'United Kingdom', 50.7514, -1.2794
 WHERE NOT EXISTS (SELECT 1 FROM places WHERE id = 'mon-pl-osborne')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-pl-osborne');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-pl-westminster', 'place', 'Westminster Abbey, London', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-pl-westminster');
INSERT INTO places (id, normalized_name, place_type, locality, region, country, latitude, longitude)
SELECT 'mon-pl-westminster', 'westminster abbey, london', 'church', 'London', 'England', 'United Kingdom', 51.4994, -0.1273
 WHERE NOT EXISTS (SELECT 1 FROM places WHERE id = 'mon-pl-westminster')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-pl-westminster');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-pl-frogmore', 'place', 'Frogmore, Windsor', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-pl-frogmore');
INSERT INTO places (id, normalized_name, place_type, locality, region, country, latitude, longitude, notes)
SELECT 'mon-pl-frogmore', 'frogmore, windsor', 'cemetery', 'Windsor', 'England', 'United Kingdom', 51.4756, -0.6003,
       'The Royal Mausoleum, built for Albert and holding Victoria beside him. She commissioned it the year he died and was buried in it forty years later.'
 WHERE NOT EXISTS (SELECT 1 FROM places WHERE id = 'mon-pl-frogmore')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-pl-frogmore');

-- ─────────────────────────────────────────────────────────────────────────────
-- SOURCES
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO sources (id, title, publisher, notes, created_at, updated_at)
SELECT 'mon-src-gazette', 'The London Gazette', 'His Majesty''s Stationery Office',
       'The official journal of record of the United Kingdom. Proclamations, accessions and the abdication instrument are published here, which makes it the primary source for the constitutional dates in this tree.',
       datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'mon-src-gazette');

INSERT INTO sources (id, title, author, notes, created_at, updated_at)
SELECT 'mon-src-dawson', 'The diaries of Bertrand Dawson, 1st Viscount Dawson of Penn', 'Bertrand Dawson',
       'The private notes of George V''s physician, opened to his biographer and published in 1986. They are the only account of the king''s last hour from the man who administered the injections, and they contradict fifty years of official record.',
       datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'mon-src-dawson');

INSERT INTO sources (id, title, publisher, notes, created_at, updated_at)
SELECT 'mon-src-times', 'The Times', 'Times Newspapers',
       'Court circulars, obituaries and the daily bulletins issued from the royal sickrooms. Contemporary and detailed, but it printed what the household released, which is why it agrees with the official account of 1936 and not with Dawson''s diary.',
       datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'mon-src-times');

INSERT INTO sources (id, title, publisher, notes, created_at, updated_at)
SELECT 'mon-src-gro', 'General Register Office, England and Wales', 'General Register Office',
       'Civil registration of births, marriages and deaths from 1837. Covers everyone in this tree born in England after that date, which is the reason Wallis Simpson''s birth is the one date here that cannot be settled.',
       datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'mon-src-gro');

-- ─────────────────────────────────────────────────────────────────────────────
-- ARTIFACTS used as claim evidence
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO archive_objects (id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-art-abdication', 'artifact',
       'His Majesty''s Declaration of Abdication Act 1936',
       'The instrument of abdication signed at Fort Belvedere on 10 December 1936 and given effect by Act of Parliament the following day.',
       'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-art-abdication');
INSERT INTO artifacts (id, artifact_type_id, evidence_classification_id, original_date_text, creator_text)
SELECT 'mon-art-abdication', 'artifact_type_document', 'evidence_official_record', '10 December 1936', 'Edward VIII'
 WHERE NOT EXISTS (SELECT 1 FROM artifacts WHERE id = 'mon-art-abdication')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-art-abdication');

INSERT INTO archive_objects (id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-art-dawson-diary', 'artifact',
       'Lord Dawson of Penn, diary entry for 20 January 1936',
       'The physician''s own account of the night George V died, including the injections he administered and his reason for the timing.',
       'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-art-dawson-diary');
INSERT INTO artifacts (id, artifact_type_id, evidence_classification_id, original_date_text, creator_text, transcription)
SELECT 'mon-art-dawson-diary', 'artifact_type_diary', 'evidence_primary_source', '20 January 1936', 'Bertrand Dawson',
       'Dawson records deciding to end a life that had "moved steadily towards its close", and timing it so the announcement would reach the morning papers rather than "the less appropriate evening journals".'
 WHERE NOT EXISTS (SELECT 1 FROM artifacts WHERE id = 'mon-art-dawson-diary')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-art-dawson-diary');

INSERT INTO archive_objects (id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-art-bulletin', 'artifact',
       'Official bulletin from Sandringham, 20 January 1936',
       'The household''s announcement that "The King''s life is moving peacefully towards its close", issued hours before the death.',
       'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-art-bulletin');
INSERT INTO artifacts (id, artifact_type_id, evidence_classification_id, original_date_text)
SELECT 'mon-art-bulletin', 'artifact_type_newspaper', 'evidence_secondary_source', '20 January 1936'
 WHERE NOT EXISTS (SELECT 1 FROM artifacts WHERE id = 'mon-art-bulletin')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-art-bulletin');

INSERT INTO archive_objects (id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-art-albert-bulletins', 'artifact',
       'Medical bulletins from Windsor, November to December 1861',
       'The attending physicians'' daily notices through Albert''s final illness, describing a fever of some weeks’ standing.',
       'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-art-albert-bulletins');
INSERT INTO artifacts (id, artifact_type_id, evidence_classification_id, original_date_text)
SELECT 'mon-art-albert-bulletins', 'artifact_type_document', 'evidence_secondary_source', 'November-December 1861'
 WHERE NOT EXISTS (SELECT 1 FROM artifacts WHERE id = 'mon-art-albert-bulletins')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-art-albert-bulletins');

-- ─────────────────────────────────────────────────────────────────────────────
-- PEOPLE  (25 across six generations; no minors)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-victoria', 'person', 'Victoria', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-victoria');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-victoria', 'F', 0, 0, 'Victoria', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-victoria')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-victoria');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-victoria-name', 'mon-victoria', 'birth', 'Queen', 'Victoria', NULL, NULL, 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-victoria-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-victoria');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-victoria-birth', 'mon-victoria', 'birth', '24 MAY 1819', 'exact', 18190524, 'Kensington Palace, London', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-victoria-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-victoria');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-victoria-death', 'mon-victoria', 'death', '22 JAN 1901', 'exact', 19010122, 'Osborne House, Isle of Wight', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-victoria-death')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-victoria');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-victoria-burial', 'mon-victoria', 'burial', '22 JAN 1901', 'exact', 19010122, 'Frogmore, Windsor', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-victoria-burial')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-victoria');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-albert', 'person', 'Albert of Saxe-Coburg and Gotha', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-albert');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-albert', 'M', 0, 0, 'Albert of Saxe-Coburg and Gotha', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-albert')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-albert');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-albert-name', 'mon-albert', 'birth', 'Prince', 'Albert', 'Augustus Charles Emmanuel', 'of Saxe-Coburg and Gotha', 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-albert-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-albert');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-albert-birth', 'mon-albert', 'birth', '26 AUG 1819', 'exact', 18190826, 'Schloss Rosenau, Coburg', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-albert-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-albert');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-albert-death', 'mon-albert', 'death', '14 DEC 1861', 'exact', 18611214, 'Windsor Castle, Berkshire', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-albert-death')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-albert');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-albert-burial', 'mon-albert', 'burial', '14 DEC 1861', 'exact', 18611214, 'Frogmore, Windsor', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-albert-burial')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-albert');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-edward7', 'person', 'Edward VII', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-edward7');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-edward7', 'M', 0, 0, 'Edward VII', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward7')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-edward7');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-edward7-name', 'mon-edward7', 'birth', 'King', 'Edward', 'Albert', 'VII', 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-edward7-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward7');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-edward7-birth', 'mon-edward7', 'birth', '9 NOV 1841', 'exact', 18411109, 'Buckingham Palace, London', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-edward7-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward7');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-edward7-death', 'mon-edward7', 'death', '6 MAY 1910', 'exact', 19100506, 'Buckingham Palace, London', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-edward7-death')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward7');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-edward7-burial', 'mon-edward7', 'burial', '6 MAY 1910', 'exact', 19100506, 'St George''s Chapel, Windsor Castle', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-edward7-burial')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward7');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-alexandra', 'person', 'Alexandra of Denmark', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-alexandra');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-alexandra', 'F', 0, 0, 'Alexandra of Denmark', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-alexandra')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-alexandra');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-alexandra-name', 'mon-alexandra', 'birth', 'Queen', 'Alexandra', NULL, 'of Denmark', 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-alexandra-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-alexandra');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-alexandra-birth', 'mon-alexandra', 'birth', '1 DEC 1844', 'exact', 18441201, 'Copenhagen, Denmark', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-alexandra-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-alexandra');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-alexandra-death', 'mon-alexandra', 'death', '20 NOV 1925', 'exact', 19251120, 'Sandringham House, Norfolk', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-alexandra-death')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-alexandra');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-alexandra-burial', 'mon-alexandra', 'burial', '20 NOV 1925', 'exact', 19251120, 'St George''s Chapel, Windsor Castle', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-alexandra-burial')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-alexandra');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-alice', 'person', 'Alice', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-alice');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-alice', 'F', 0, 0, 'Alice', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-alice')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-alice');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-alice-name', 'mon-alice', 'birth', 'Princess', 'Alice', 'Maud Mary', NULL, 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-alice-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-alice');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-alice-birth', 'mon-alice', 'birth', '25 APR 1843', 'exact', 18430425, 'Buckingham Palace, London', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-alice-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-alice');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-alice-death', 'mon-alice', 'death', '14 DEC 1878', 'exact', 18781214, 'Darmstadt, Hesse', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-alice-death')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-alice');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-george5', 'person', 'George V', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-george5');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-george5', 'M', 0, 0, 'George V', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-george5')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-george5');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-george5-name', 'mon-george5', 'birth', 'King', 'George', 'Frederick Ernest Albert', 'V', 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-george5-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-george5');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-george5-birth', 'mon-george5', 'birth', '3 JUN 1865', 'exact', 18650603, 'Marlborough House, London', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-george5-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-george5');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-george5-death', 'mon-george5', 'death', '20 JAN 1936', 'exact', 19360120, 'Sandringham House, Norfolk', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-george5-death')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-george5');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-george5-burial', 'mon-george5', 'burial', '20 JAN 1936', 'exact', 19360120, 'St George''s Chapel, Windsor Castle', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-george5-burial')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-george5');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-mary', 'person', 'Mary of Teck', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-mary');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-mary', 'F', 0, 0, 'Mary of Teck', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-mary')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-mary');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-mary-name', 'mon-mary', 'birth', 'Queen', 'Mary', 'Victoria', 'of Teck', 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-mary-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-mary');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-mary-birth', 'mon-mary', 'birth', '26 MAY 1867', 'exact', 18670526, 'Kensington Palace, London', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-mary-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-mary');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-mary-death', 'mon-mary', 'death', '24 MAR 1953', 'exact', 19530324, 'Marlborough House, London', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-mary-death')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-mary');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-mary-burial', 'mon-mary', 'burial', '24 MAR 1953', 'exact', 19530324, 'St George''s Chapel, Windsor Castle', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-mary-burial')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-mary');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-edward8', 'person', 'Edward VIII', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-edward8');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-edward8', 'M', 0, 0, 'Edward VIII', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward8')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-edward8');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-edward8-name', 'mon-edward8', 'birth', 'King', 'Edward', 'Albert Christian', 'VIII', 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-edward8-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward8');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-edward8-birth', 'mon-edward8', 'birth', '23 JUN 1894', 'exact', 18940623, 'White Lodge, Richmond', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-edward8-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward8');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-edward8-death', 'mon-edward8', 'death', '28 MAY 1972', 'exact', 19720528, 'Paris, France', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-edward8-death')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward8');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-edward8-burial', 'mon-edward8', 'burial', '28 MAY 1972', 'exact', 19720528, 'Frogmore, Windsor', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-edward8-burial')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward8');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-wallis', 'person', 'Wallis Warfield', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-wallis');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-wallis', 'F', 0, 0, 'Wallis Warfield', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-wallis')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-wallis');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-wallis-name', 'mon-wallis', 'birth', 'Duchess', 'Wallis', NULL, 'Warfield', 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-wallis-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-wallis');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-wallis-birth', 'mon-wallis', 'birth', '19 JUN 1896', 'exact', 18960619, 'Blue Ridge Summit, Pennsylvania', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-wallis-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-wallis');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-wallis-death', 'mon-wallis', 'death', '24 APR 1986', 'exact', 19860424, 'Paris, France', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-wallis-death')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-wallis');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-wallis-burial', 'mon-wallis', 'burial', '24 APR 1986', 'exact', 19860424, 'Frogmore, Windsor', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-wallis-burial')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-wallis');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-george6', 'person', 'George VI', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-george6');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-george6', 'M', 0, 0, 'George VI', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-george6')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-george6');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-george6-name', 'mon-george6', 'birth', 'King', 'George', 'Albert Frederick Arthur', 'VI', 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-george6-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-george6');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-george6-birth', 'mon-george6', 'birth', '14 DEC 1895', 'exact', 18951214, 'Sandringham House, Norfolk', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-george6-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-george6');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-george6-death', 'mon-george6', 'death', '6 FEB 1952', 'exact', 19520206, 'Sandringham House, Norfolk', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-george6-death')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-george6');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-george6-burial', 'mon-george6', 'burial', '6 FEB 1952', 'exact', 19520206, 'St George''s Chapel, Windsor Castle', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-george6-burial')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-george6');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-elizabeth-qm', 'person', 'Elizabeth Bowes-Lyon', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-elizabeth-qm');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-elizabeth-qm', 'F', 0, 0, 'Elizabeth Bowes-Lyon', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-elizabeth-qm')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-elizabeth-qm');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-elizabeth-qm-name', 'mon-elizabeth-qm', 'birth', 'Queen', 'Elizabeth', 'Angela Marguerite', 'Bowes-Lyon', 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-elizabeth-qm-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-elizabeth-qm');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-elizabeth-qm-birth', 'mon-elizabeth-qm', 'birth', '4 AUG 1900', 'exact', 19000804, 'London, England', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-elizabeth-qm-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-elizabeth-qm');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-elizabeth-qm-death', 'mon-elizabeth-qm', 'death', '30 MAR 2002', 'exact', 20020330, 'Windsor, Berkshire', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-elizabeth-qm-death')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-elizabeth-qm');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-elizabeth-qm-burial', 'mon-elizabeth-qm', 'burial', '30 MAR 2002', 'exact', 20020330, 'St George''s Chapel, Windsor Castle', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-elizabeth-qm-burial')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-elizabeth-qm');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-john', 'person', 'John', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-john');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-john', 'M', 0, 0, 'John', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-john')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-john');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-john-name', 'mon-john', 'birth', 'Prince', 'John', 'Charles Francis', NULL, 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-john-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-john');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-john-birth', 'mon-john', 'birth', '12 JUL 1905', 'exact', 19050712, 'Sandringham House, Norfolk', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-john-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-john');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-john-death', 'mon-john', 'death', '18 JAN 1919', 'exact', 19190118, 'Sandringham House, Norfolk', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-john-death')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-john');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-john-burial', 'mon-john', 'burial', '18 JAN 1919', 'exact', 19190118, 'Sandringham, Norfolk', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-john-burial')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-john');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-elizabeth2', 'person', 'Elizabeth II', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-elizabeth2');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-elizabeth2', 'F', 0, 0, 'Elizabeth II', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-elizabeth2')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-elizabeth2');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-elizabeth2-name', 'mon-elizabeth2', 'birth', 'Queen', 'Elizabeth', 'Alexandra Mary', 'II', 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-elizabeth2-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-elizabeth2');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-elizabeth2-birth', 'mon-elizabeth2', 'birth', '21 APR 1926', 'exact', 19260421, 'Mayfair, London', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-elizabeth2-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-elizabeth2');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-elizabeth2-death', 'mon-elizabeth2', 'death', '8 SEP 2022', 'exact', 20220908, 'Balmoral Castle, Aberdeenshire', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-elizabeth2-death')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-elizabeth2');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-elizabeth2-burial', 'mon-elizabeth2', 'burial', '8 SEP 2022', 'exact', 20220908, 'St George''s Chapel, Windsor Castle', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-elizabeth2-burial')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-elizabeth2');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-philip', 'person', 'Philip Mountbatten', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-philip');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-philip', 'M', 0, 0, 'Philip Mountbatten', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-philip')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-philip');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-philip-name', 'mon-philip', 'birth', 'Prince', 'Philip', NULL, 'Mountbatten', 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-philip-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-philip');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-philip-birth', 'mon-philip', 'birth', '10 JUN 1921', 'exact', 19210610, 'Corfu, Greece', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-philip-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-philip');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-philip-death', 'mon-philip', 'death', '9 APR 2021', 'exact', 20210409, 'Windsor Castle, Berkshire', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-philip-death')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-philip');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-philip-burial', 'mon-philip', 'burial', '9 APR 2021', 'exact', 20210409, 'St George''s Chapel, Windsor Castle', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-philip-burial')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-philip');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-margaret', 'person', 'Margaret', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-margaret');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-margaret', 'F', 0, 0, 'Margaret', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-margaret')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-margaret');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-margaret-name', 'mon-margaret', 'birth', 'Princess', 'Margaret', 'Rose', NULL, 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-margaret-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-margaret');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-margaret-birth', 'mon-margaret', 'birth', '21 AUG 1930', 'exact', 19300821, 'Glamis Castle, Angus', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-margaret-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-margaret');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-margaret-death', 'mon-margaret', 'death', '9 FEB 2002', 'exact', 20020209, 'London, England', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-margaret-death')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-margaret');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-margaret-burial', 'mon-margaret', 'burial', '9 FEB 2002', 'exact', 20020209, 'St George''s Chapel, Windsor Castle', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-margaret-burial')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-margaret');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-charles3', 'person', 'Charles III', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-charles3');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-charles3', 'M', 1, 0, 'Charles III', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-charles3')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-charles3');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-charles3-name', 'mon-charles3', 'birth', 'King', 'Charles', 'Philip Arthur George', 'III', 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-charles3-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-charles3');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-charles3-birth', 'mon-charles3', 'birth', '14 NOV 1948', 'exact', 19481114, 'Buckingham Palace, London', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-charles3-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-charles3');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-diana', 'person', 'Diana Spencer', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-diana');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-diana', 'F', 0, 0, 'Diana Spencer', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-diana')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-diana');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-diana-name', 'mon-diana', 'birth', 'Princess', 'Diana', 'Frances', 'Spencer', 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-diana-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-diana');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-diana-birth', 'mon-diana', 'birth', '1 JUL 1961', 'exact', 19610701, 'Sandringham, Norfolk', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-diana-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-diana');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-diana-death', 'mon-diana', 'death', '31 AUG 1997', 'exact', 19970831, 'Paris, France', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-diana-death')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-diana');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-diana-burial', 'mon-diana', 'burial', '6 SEP 1997', 'exact', 19970906, 'Althorp, Northamptonshire', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-diana-burial')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-diana');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-camilla', 'person', 'Camilla Shand', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-camilla');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-camilla', 'F', 1, 0, 'Camilla Shand', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-camilla')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-camilla');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-camilla-name', 'mon-camilla', 'birth', 'Queen', 'Camilla', 'Rosemary', 'Shand', 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-camilla-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-camilla');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-camilla-birth', 'mon-camilla', 'birth', '17 JUL 1947', 'exact', 19470717, 'London, England', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-camilla-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-camilla');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-anne', 'person', 'Anne', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-anne');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-anne', 'F', 1, 0, 'Anne', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-anne')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-anne');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-anne-name', 'mon-anne', 'birth', 'Princess', 'Anne', 'Elizabeth Alice Louise', NULL, 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-anne-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-anne');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-anne-birth', 'mon-anne', 'birth', '15 AUG 1950', 'exact', 19500815, 'Clarence House, London', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-anne-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-anne');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-andrew', 'person', 'Andrew', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-andrew');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-andrew', 'M', 1, 0, 'Andrew', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-andrew')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-andrew');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-andrew-name', 'mon-andrew', 'birth', 'Prince', 'Andrew', 'Albert Christian Edward', NULL, 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-andrew-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-andrew');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-andrew-birth', 'mon-andrew', 'birth', '19 FEB 1960', 'exact', 19600219, 'Buckingham Palace, London', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-andrew-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-andrew');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-edward-w', 'person', 'Edward', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-edward-w');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-edward-w', 'M', 1, 0, 'Edward', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward-w')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-edward-w');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-edward-w-name', 'mon-edward-w', 'birth', 'Prince', 'Edward', 'Antony Richard Louis', NULL, 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-edward-w-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward-w');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-edward-w-birth', 'mon-edward-w', 'birth', '10 MAR 1964', 'exact', 19640310, 'Buckingham Palace, London', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-edward-w-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward-w');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-william', 'person', 'William', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-william');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-william', 'M', 1, 0, 'William', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-william')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-william');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-william-name', 'mon-william', 'birth', 'Prince', 'William', 'Arthur Philip Louis', NULL, 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-william-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-william');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-william-birth', 'mon-william', 'birth', '21 JUN 1982', 'exact', 19820621, 'London, England', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-william-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-william');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-catherine', 'person', 'Catherine Middleton', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-catherine');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-catherine', 'F', 1, 0, 'Catherine Middleton', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-catherine')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-catherine');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-catherine-name', 'mon-catherine', 'birth', 'Princess', 'Catherine', 'Elizabeth', 'Middleton', 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-catherine-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-catherine');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-catherine-birth', 'mon-catherine', 'birth', '9 JAN 1982', 'exact', 19820109, 'Reading, Berkshire', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-catherine-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-catherine');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-harry', 'person', 'Henry', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-harry');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-harry', 'M', 1, 0, 'Henry', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-harry')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-harry');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-harry-name', 'mon-harry', 'birth', 'Prince', 'Henry', 'Charles Albert David', NULL, 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-harry-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-harry');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-harry-birth', 'mon-harry', 'birth', '15 SEP 1984', 'exact', 19840915, 'London, England', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-harry-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-harry');

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-meghan', 'person', 'Meghan Markle', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-meghan');
INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
SELECT 'mon-meghan', 'F', 1, 0, 'Meghan Markle', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM persons WHERE id = 'mon-meghan')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-meghan');
INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, is_primary, sort_order, created_at, updated_at)
SELECT 'mon-meghan-name', 'mon-meghan', 'birth', 'Duchess', 'Meghan', NULL, 'Markle', 1, 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM names WHERE id = 'mon-meghan-name')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-meghan');
INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, created_at, updated_at)
SELECT 'mon-meghan-birth', 'mon-meghan', 'birth', '4 AUG 1981', 'exact', 19810804, 'Los Angeles, California', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'mon-meghan-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-meghan');

-- ─────────────────────────────────────────────────────────────────────────────
-- FAMILIES  (including one divorce and one remarriage)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, marriage_date_qualifier, marriage_date_sort_key, marriage_place, divorce_date, created_at, updated_at)
SELECT 'mon-fam-v-a', 'mon-victoria', 'mon-albert', '10 FEB 1840', 'exact', 18400210, 'Chapel Royal, St James''s Palace, London', NULL, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-v-a')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-victoria')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-albert');
INSERT INTO family_members (id, family_id, person_id, role, sort_order, created_at)
SELECT 'mon-fam-v-a-edward7', 'mon-fam-v-a', 'mon-edward7', 'child', 0, datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM family_members WHERE id = 'mon-fam-v-a-edward7')
   AND EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-v-a')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward7');
INSERT INTO family_members (id, family_id, person_id, role, sort_order, created_at)
SELECT 'mon-fam-v-a-alice', 'mon-fam-v-a', 'mon-alice', 'child', 1, datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM family_members WHERE id = 'mon-fam-v-a-alice')
   AND EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-v-a')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-alice');

INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, marriage_date_qualifier, marriage_date_sort_key, marriage_place, divorce_date, created_at, updated_at)
SELECT 'mon-fam-e7-alex', 'mon-edward7', 'mon-alexandra', '10 MAR 1863', 'exact', 18630310, 'St George''s Chapel, Windsor Castle', NULL, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-e7-alex')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward7')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-alexandra');
INSERT INTO family_members (id, family_id, person_id, role, sort_order, created_at)
SELECT 'mon-fam-e7-alex-george5', 'mon-fam-e7-alex', 'mon-george5', 'child', 0, datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM family_members WHERE id = 'mon-fam-e7-alex-george5')
   AND EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-e7-alex')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-george5');

INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, marriage_date_qualifier, marriage_date_sort_key, marriage_place, divorce_date, created_at, updated_at)
SELECT 'mon-fam-g5-mary', 'mon-george5', 'mon-mary', '6 JUL 1893', 'exact', 18930706, 'Chapel Royal, St James''s Palace, London', NULL, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-g5-mary')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-george5')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-mary');
INSERT INTO family_members (id, family_id, person_id, role, sort_order, created_at)
SELECT 'mon-fam-g5-mary-edward8', 'mon-fam-g5-mary', 'mon-edward8', 'child', 0, datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM family_members WHERE id = 'mon-fam-g5-mary-edward8')
   AND EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-g5-mary')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward8');
INSERT INTO family_members (id, family_id, person_id, role, sort_order, created_at)
SELECT 'mon-fam-g5-mary-george6', 'mon-fam-g5-mary', 'mon-george6', 'child', 1, datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM family_members WHERE id = 'mon-fam-g5-mary-george6')
   AND EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-g5-mary')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-george6');
INSERT INTO family_members (id, family_id, person_id, role, sort_order, created_at)
SELECT 'mon-fam-g5-mary-john', 'mon-fam-g5-mary', 'mon-john', 'child', 2, datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM family_members WHERE id = 'mon-fam-g5-mary-john')
   AND EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-g5-mary')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-john');

INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, marriage_date_qualifier, marriage_date_sort_key, marriage_place, divorce_date, created_at, updated_at)
SELECT 'mon-fam-e8-wallis', 'mon-edward8', 'mon-wallis', '3 JUN 1937', 'exact', 19370603, 'Château de Candé, Monts, France', NULL, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-e8-wallis')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward8')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-wallis');
INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, marriage_date_qualifier, marriage_date_sort_key, marriage_place, divorce_date, created_at, updated_at)
SELECT 'mon-fam-g6-eliz', 'mon-george6', 'mon-elizabeth-qm', '26 APR 1923', 'exact', 19230426, 'Westminster Abbey, London', NULL, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-g6-eliz')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-george6')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-elizabeth-qm');
INSERT INTO family_members (id, family_id, person_id, role, sort_order, created_at)
SELECT 'mon-fam-g6-eliz-elizabeth2', 'mon-fam-g6-eliz', 'mon-elizabeth2', 'child', 0, datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM family_members WHERE id = 'mon-fam-g6-eliz-elizabeth2')
   AND EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-g6-eliz')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-elizabeth2');
INSERT INTO family_members (id, family_id, person_id, role, sort_order, created_at)
SELECT 'mon-fam-g6-eliz-margaret', 'mon-fam-g6-eliz', 'mon-margaret', 'child', 1, datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM family_members WHERE id = 'mon-fam-g6-eliz-margaret')
   AND EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-g6-eliz')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-margaret');

INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, marriage_date_qualifier, marriage_date_sort_key, marriage_place, divorce_date, created_at, updated_at)
SELECT 'mon-fam-e2-phil', 'mon-elizabeth2', 'mon-philip', '20 NOV 1947', 'exact', 19471120, 'Westminster Abbey, London', NULL, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-e2-phil')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-elizabeth2')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-philip');
INSERT INTO family_members (id, family_id, person_id, role, sort_order, created_at)
SELECT 'mon-fam-e2-phil-charles3', 'mon-fam-e2-phil', 'mon-charles3', 'child', 0, datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM family_members WHERE id = 'mon-fam-e2-phil-charles3')
   AND EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-e2-phil')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-charles3');
INSERT INTO family_members (id, family_id, person_id, role, sort_order, created_at)
SELECT 'mon-fam-e2-phil-anne', 'mon-fam-e2-phil', 'mon-anne', 'child', 1, datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM family_members WHERE id = 'mon-fam-e2-phil-anne')
   AND EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-e2-phil')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-anne');
INSERT INTO family_members (id, family_id, person_id, role, sort_order, created_at)
SELECT 'mon-fam-e2-phil-andrew', 'mon-fam-e2-phil', 'mon-andrew', 'child', 2, datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM family_members WHERE id = 'mon-fam-e2-phil-andrew')
   AND EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-e2-phil')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-andrew');
INSERT INTO family_members (id, family_id, person_id, role, sort_order, created_at)
SELECT 'mon-fam-e2-phil-edward-w', 'mon-fam-e2-phil', 'mon-edward-w', 'child', 3, datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM family_members WHERE id = 'mon-fam-e2-phil-edward-w')
   AND EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-e2-phil')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward-w');

INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, marriage_date_qualifier, marriage_date_sort_key, marriage_place, divorce_date, created_at, updated_at)
SELECT 'mon-fam-c3-diana', 'mon-charles3', 'mon-diana', '29 JUL 1981', 'exact', 19810729, 'St Paul''s Cathedral, London', '28 AUG 1996', datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-c3-diana')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-charles3')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-diana');
INSERT INTO family_members (id, family_id, person_id, role, sort_order, created_at)
SELECT 'mon-fam-c3-diana-william', 'mon-fam-c3-diana', 'mon-william', 'child', 0, datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM family_members WHERE id = 'mon-fam-c3-diana-william')
   AND EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-c3-diana')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-william');
INSERT INTO family_members (id, family_id, person_id, role, sort_order, created_at)
SELECT 'mon-fam-c3-diana-harry', 'mon-fam-c3-diana', 'mon-harry', 'child', 1, datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM family_members WHERE id = 'mon-fam-c3-diana-harry')
   AND EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-c3-diana')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-harry');

INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, marriage_date_qualifier, marriage_date_sort_key, marriage_place, divorce_date, created_at, updated_at)
SELECT 'mon-fam-c3-camilla', 'mon-charles3', 'mon-camilla', '9 APR 2005', 'exact', 20050409, 'Windsor Guildhall, Berkshire', NULL, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-c3-camilla')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-charles3')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-camilla');
INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, marriage_date_qualifier, marriage_date_sort_key, marriage_place, divorce_date, created_at, updated_at)
SELECT 'mon-fam-w-cath', 'mon-william', 'mon-catherine', '29 APR 2011', 'exact', 20110429, 'Westminster Abbey, London', NULL, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-w-cath')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-william')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-catherine');
INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, marriage_date_qualifier, marriage_date_sort_key, marriage_place, divorce_date, created_at, updated_at)
SELECT 'mon-fam-h-meg', 'mon-harry', 'mon-meghan', '19 MAY 2018', 'exact', 20180519, 'St George''s Chapel, Windsor Castle', NULL, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM families WHERE id = 'mon-fam-h-meg')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-harry')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-meghan');
-- ─────────────────────────────────────────────────────────────────────────────
-- RESEARCH NOTES
--
-- Written in the capitalised-opening-sentence style the Research tab parses
-- into addressable sections, so the sectioning, the contents list and the claim
-- anchors all have real prose to work on. The headings below are what the
-- claims further down point at by slug.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE persons SET notes =
  'Prince Consort from 1857, and the organising intelligence behind the Great Exhibition of 1851.' || char(10) || char(10) ||
  'TYPHOID IS THE TRADITIONAL ANSWER AND IT IS PROBABLY WRONG. The official cause of death was typhoid fever, given by Sir William Jenner, and it stood unchallenged for over a century. The difficulty is the timeline: Albert had complained of stomach cramps, nausea and wasting for at least two years before December 1861, and typhoid does not behave that way. A fever that kills in three weeks does not announce itself two years in advance.' || char(10) || char(10) ||
  'THE COMPETING READING IS A CHRONIC ABDOMINAL DISEASE. Modern reviewers have proposed Crohn''s disease, and others an abdominal cancer, either of which fits a long decline punctuated by a terminal collapse. Neither can be proved: there was no autopsy, the attending physicians recorded symptoms rather than findings, and nothing survives to test.' || char(10) || char(10) ||
  'WHAT THIS ARCHIVE HOLDS. The death date and place are certain and are not in question. The CAUSE is recorded as disputed, because that is what it is -- the contemporary record and the modern reading disagree, and no document settles it. See the claim on this page.' || char(10) || char(10) ||
  'HIS WIDOW NEVER MOVED HIM. Victoria commissioned the Royal Mausoleum at Frogmore the year he died and was buried beside him forty years later. His rooms at Windsor were kept as he left them for the rest of her life.'
 WHERE id = 'mon-albert' AND notes IS NULL;

UPDATE persons SET notes =
  'Queen of the United Kingdom from 1837, and the longest-reigning British sovereign until 2015.' || char(10) || char(10) ||
  'THE HAEMOPHILIA MUTATION APPEARS WITH HER AND NOBODY KNOWS WHY. Victoria was a carrier of haemophilia B, and through her daughters the condition reached the royal houses of Prussia, Spain and Russia. No carrier is known among her ancestors on either side, and no affected male appears in the earlier generations of her line.' || char(10) || char(10) ||
  'THE LIKELIEST EXPLANATION IS A NEW MUTATION, AND IT IS NOT PROVED. A spontaneous mutation in Victoria herself, or in the germ line of her father Edward, Duke of Kent, accounts for the evidence without requiring a carrier nobody recorded. It remains an inference from absence: the alternative -- an unrecorded carrier among her maternal forebears -- cannot be excluded, because the records that would show it were never kept to that standard.' || char(10) || char(10) ||
  'NEGATIVE EVIDENCE, AND WHY IT IS FILED HERE. No affected male and no obligate carrier has been identified before her. That is the whole of the case, and it is an argument from silence, which is why the claim on this page is graded Probable rather than Confirmed.' || char(10) || char(10) ||
  'DO NOT LOOK AGAIN WITHOUT A NEW IDEA. The genealogy of her maternal line has been worked over thoroughly and produces nothing further. Only a genetic result from identified remains would move this, and that is not a records question.'
 WHERE id = 'mon-victoria' AND notes IS NULL;

UPDATE persons SET notes =
  'King of the United Kingdom from 1910, and the first sovereign of the House of Windsor, which he renamed in 1917.' || char(10) || char(10) ||
  'HIS DEATH WAS HASTENED, AND THE RECORD SAID OTHERWISE FOR FIFTY YEARS. The official account was a peaceful decline at Sandringham on the evening of 20 January 1936, and the bulletin issued from the house -- "The King''s life is moving peacefully towards its close" -- was printed everywhere. His physician, Lord Dawson of Penn, wrote the bulletin. He also administered the injections of morphine and cocaine that ended the life it described.' || char(10) || char(10) ||
  'THE DIARY IS THE SOURCE AND IT IS HIS OWN. Dawson''s private notes, opened to his biographer and published in 1986, record both the decision and the reasoning behind its timing: he wished the announcement to reach the morning papers rather than, as he put it, the less appropriate evening journals. The contemporary bulletins and the diary describe the same hour and do not agree about what happened in it.' || char(10) || char(10) ||
  'THE CONCLUSION IS SETTLED EVEN THOUGH THE RECORDS CONFLICT. This is the ordinary shape of a resolved question rather than an open one: one first-hand account from the man responsible, against a public statement written by the same man for a different purpose. The claim on this page is Confirmed and its status is conflicted, and both are correct.' || char(10) || char(10) ||
  'A SON IS MISSING FROM THE FAMILY PHOTOGRAPHS. His youngest, Prince John, lived apart from the household from 1917 and died at thirteen. See his own page.'
 WHERE id = 'mon-george5' AND notes IS NULL;

UPDATE persons SET notes =
  'The youngest child of George V and Queen Mary.' || char(10) || char(10) ||
  'A SON KEPT OUT OF THE PHOTOGRAPHS. John had epilepsy, which in 1917 was a condition a royal household did not display. From the age of eleven he lived at Wood Farm on the Sandringham estate with his nurse, Charlotte Bill, apart from his parents and his brothers. He was not present at public occasions and he appears in almost no official photographs after that date.' || char(10) || char(10) ||
  'WHAT THE RECORD ACTUALLY SHOWS, AND WHAT IT DOES NOT. His birth, his death at Sandringham on 18 January 1919, and his burial in the churchyard there are all documented and certain. The seclusion is equally well attested. What is NOT supported is the harsher reading sometimes attached to it -- that he was hidden in shame or neglected. His mother''s letters and his nurse''s account both describe visits and affection, and this archive does not record the stronger claim.' || char(10) || char(10) ||
  'A CAUTION FOR WHOEVER READS THIS NEXT. The temptation with a child written out of the family record is to over-correct and write a tragedy back in. The documented facts are the illness, the separate household and the early death. That is what is recorded here.'
 WHERE id = 'mon-john' AND notes IS NULL;

UPDATE persons SET notes =
  'King from January 1936 and the only British sovereign to resign the crown voluntarily. Duke of Windsor thereafter.' || char(10) || char(10) ||
  'THE ABDICATION HAS A DATE AND IT IS NOT THE ONE PEOPLE REMEMBER. He signed the Instrument of Abdication at Fort Belvedere on 10 DECEMBER 1936. It took legal effect the following day, 11 December, when His Majesty''s Declaration of Abdication Act received royal assent -- and it is 11 December, not the 10th, that ended the reign. The broadcast in which he explained himself was made on the evening of the 11th, after he was no longer king.' || char(10) || char(10) ||
  'TWO DATES, BOTH CORRECT, FOR DIFFERENT THINGS. The signature and the statute are a day apart, and sources disagree only because they are answering different questions. This archive records the reign as ending on 11 December and files the signing as its own event.'
 WHERE id = 'mon-edward8' AND notes IS NULL;

UPDATE persons SET notes =
  'Duchess of Windsor from 1937. Her marriage to Edward VIII followed his abdication by six months.' || char(10) || char(10) ||
  'HER BIRTH DATE RESTS ON NO CERTIFICATE. 19 June 1896 at Blue Ridge Summit, Pennsylvania is the date she gave and the one generally printed. There is no birth certificate: Pennsylvania did not require statewide registration until 1906, and the resort where she was born kept no register that survives.' || char(10) || char(10) ||
  'THE YEAR HAS BEEN QUESTIONED AND THE QUESTION IS OPEN. Some accounts place the birth in 1895 or 1897, and her own statements over the years are not perfectly consistent. The competing dates rest on recollection and on later documents she supplied herself, which is the weakest kind of support for a birth date.' || char(10) || char(10) ||
  'FILED AS POSSIBLE, NOT PROBABLE. One self-reported date, no contemporaneous record, and known variation. The claim on this page is graded accordingly, and it is the weakest-supported statement in this archive -- which is the reason it is here.'
 WHERE id = 'mon-wallis' AND notes IS NULL;

UPDATE persons SET notes =
  'Queen from 1952 and the longest-reigning British sovereign.' || char(10) || char(10) ||
  'BORN IN A PRIVATE HOUSE, NOT A PALACE. 17 Bruton Street, Mayfair -- her maternal grandfather''s London house -- on 21 April 1926. The building no longer stands. Her birth was registered in the ordinary way and the record is unambiguous, which is worth noting in a tree where two other birth dates are not.' || char(10) || char(10) ||
  'TWO BIRTHDAYS, ONE OF THEM INVENTED ON PURPOSE. The April date is the real one; the Official Birthday observed in June is a scheduling convention for the weather and is not a competing claim about when she was born. They are not in conflict and should not be recorded as though they were.'
 WHERE id = 'mon-elizabeth2' AND notes IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- CLAIMS
--
-- Eight conclusions at five confidence levels, each anchored to the passage
-- that argues it. Every research_section slug below was produced by the same
-- parser the Research tab uses, run against the notes above -- several are
-- truncated at the 60-character cap, which is why they are copied from the
-- parser's output rather than written by hand.
--
-- Confidence is how settled the conclusion is; status is the state of the
-- records. They are set independently, and three of these are Confirmed with
-- conflicting records, which is the normal shape of a resolved argument.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Albert's cause of death: the contemporary record against the modern reading.
INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-cl-albert-cause', 'claim', 'He did not die of typhoid fever.', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-cl-albert-cause')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-albert');
INSERT INTO claims (id, statement, claim_type, subject_object_id, confidence_level_id, confidence_score, status, notes, research_section)
SELECT 'mon-cl-albert-cause', 'He did not die of typhoid fever.', 'medical', 'mon-albert',
       'confidence_disputed', 40, 'conflicted',
       'Typhoid was certified at the time and stood for a century, but Albert had been wasting with abdominal symptoms for two years before December 1861 and typhoid does not run that course. Crohn''s disease and an abdominal cancer have both been proposed and neither can be proved: there was no autopsy and nothing survives to test. Recorded as disputed because the contemporary certificate and the modern reading genuinely disagree.',
       'note-typhoid-is-the-traditional-answer-and-it-is-probably-wrong'
 WHERE NOT EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-albert-cause')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-cl-albert-cause');
INSERT INTO claim_subjects (id, claim_id, subject_object_id, role)
SELECT 'mon-cs-albert-cause', 'mon-cl-albert-cause', 'mon-albert', 'subject'
 WHERE NOT EXISTS (SELECT 1 FROM claim_subjects WHERE id = 'mon-cs-albert-cause')
   AND EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-albert-cause');
INSERT INTO claim_evidence (id, claim_id, evidence_object_id, evidence_role, evidence_classification_id, excerpt, notes)
SELECT 'mon-ce-albert-1', 'mon-cl-albert-cause', 'mon-art-albert-bulletins', 'contradicts', 'evidence_secondary_source',
       'typhoid fever', 'The attending physicians'' notices, which certify the traditional cause. Filed as contradicting because it is the reading this claim rejects.'
 WHERE NOT EXISTS (SELECT 1 FROM claim_evidence WHERE id = 'mon-ce-albert-1')
   AND EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-albert-cause')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-art-albert-bulletins');

-- 2. George V's death: Confirmed, and the records conflict.
INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-cl-g5-death', 'claim', 'His death was hastened by his physician.', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-cl-g5-death')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-george5');
INSERT INTO claims (id, statement, claim_type, subject_object_id, date_text, confidence_level_id, confidence_score, status, notes, research_section)
SELECT 'mon-cl-g5-death', 'His death was hastened by his physician.', 'medical', 'mon-george5', '20 January 1936',
       'confidence_confirmed', 95, 'conflicted',
       'Lord Dawson of Penn administered morphine and cocaine on the evening of 20 January 1936, and recorded doing so in his own diary along with his reason for the timing: he wanted the announcement in the morning papers rather than the evening ones. He also wrote the official bulletin describing a peaceful decline. One first-hand account by the man responsible, against a public statement written by the same man for a different purpose -- so the conclusion is settled and the records conflict.',
       'note-his-death-was-hastened-and-the-record-said-otherwise-for'
 WHERE NOT EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-g5-death')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-cl-g5-death');
INSERT INTO claim_subjects (id, claim_id, subject_object_id, role)
SELECT 'mon-cs-g5-death', 'mon-cl-g5-death', 'mon-george5', 'subject'
 WHERE NOT EXISTS (SELECT 1 FROM claim_subjects WHERE id = 'mon-cs-g5-death')
   AND EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-g5-death');
INSERT INTO claim_evidence (id, claim_id, evidence_object_id, evidence_role, evidence_classification_id, excerpt, notes)
SELECT 'mon-ce-g5-1', 'mon-cl-g5-death', 'mon-art-dawson-diary', 'supports', 'evidence_primary_source',
       'moved steadily towards its close', 'The physician''s own diary, published 1986. First-hand and decisive.'
 WHERE NOT EXISTS (SELECT 1 FROM claim_evidence WHERE id = 'mon-ce-g5-1')
   AND EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-g5-death')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-art-dawson-diary');
INSERT INTO claim_evidence (id, claim_id, evidence_object_id, evidence_role, evidence_classification_id, excerpt, notes)
SELECT 'mon-ce-g5-2', 'mon-cl-g5-death', 'mon-art-bulletin', 'contradicts', 'evidence_secondary_source',
       'The King''s life is moving peacefully towards its close',
       'The official bulletin, which describes a natural decline. Written by Dawson himself, which is why it does not outweigh his diary.'
 WHERE NOT EXISTS (SELECT 1 FROM claim_evidence WHERE id = 'mon-ce-g5-2')
   AND EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-g5-death')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-art-bulletin');

-- 3. Victoria and the haemophilia mutation: Probable, argued from absence.
INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-cl-victoria-haem', 'claim', 'The haemophilia mutation in her line began with her.', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-cl-victoria-haem')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-victoria');
INSERT INTO claims (id, statement, claim_type, subject_object_id, confidence_level_id, confidence_score, status, notes, research_section)
SELECT 'mon-cl-victoria-haem', 'The haemophilia mutation in her line began with her.', 'medical', 'mon-victoria',
       'confidence_probable', 65, 'supported',
       'A new mutation in Victoria or in her father''s germ line accounts for the evidence without requiring a carrier nobody recorded. No obligate carrier and no affected male has been identified in the earlier generations. That is an argument from silence -- the records that would show an unrecorded carrier were never kept to that standard -- so it is graded Probable and not Confirmed. Only a genetic result from identified remains would move it.',
       'note-the-likeliest-explanation-is-a-new-mutation-and-it-is-not'
 WHERE NOT EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-victoria-haem')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-cl-victoria-haem');
INSERT INTO claim_subjects (id, claim_id, subject_object_id, role)
SELECT 'mon-cs-victoria-haem', 'mon-cl-victoria-haem', 'mon-victoria', 'subject'
 WHERE NOT EXISTS (SELECT 1 FROM claim_subjects WHERE id = 'mon-cs-victoria-haem')
   AND EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-victoria-haem');

-- 4. Prince John: Confirmed, and deliberately narrower than the popular story.
INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-cl-john-seclusion', 'claim', 'He lived apart from the household from 1917 because of his epilepsy.', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-cl-john-seclusion')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-john');
INSERT INTO claims (id, statement, claim_type, subject_object_id, confidence_level_id, confidence_score, status, notes, research_section)
SELECT 'mon-cl-john-seclusion', 'He lived apart from the household from 1917 because of his epilepsy.', 'other', 'mon-john',
       'confidence_confirmed', 95, 'supported',
       'The illness, the separate household at Wood Farm with his nurse Charlotte Bill, and his absence from official photographs after 1917 are all well attested. What is NOT claimed here is the harsher reading -- that he was hidden in shame or neglected. His mother''s letters and his nurse''s account describe visits and affection, and this archive records the documented arrangement rather than the tragedy often written back into it.',
       'note-a-son-kept-out-of-the-photographs'
 WHERE NOT EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-john-seclusion')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-cl-john-seclusion');
INSERT INTO claim_subjects (id, claim_id, subject_object_id, role)
SELECT 'mon-cs-john-seclusion', 'mon-cl-john-seclusion', 'mon-john', 'subject'
 WHERE NOT EXISTS (SELECT 1 FROM claim_subjects WHERE id = 'mon-cs-john-seclusion')
   AND EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-john-seclusion');

-- 5. The abdication: Confirmed, two dates a day apart, both correct.
INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-cl-abdication', 'claim', 'His reign ended on 11 December 1936, not the 10th.', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-cl-abdication')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-edward8');
INSERT INTO claims (id, statement, claim_type, subject_object_id, date_text, confidence_level_id, confidence_score, status, notes, research_section)
SELECT 'mon-cl-abdication', 'His reign ended on 11 December 1936, not the 10th.', 'date', 'mon-edward8', '11 December 1936',
       'confidence_confirmed', 95, 'supported',
       'He signed the Instrument of Abdication on 10 December; it took effect on 11 December when the Declaration of Abdication Act received royal assent. Sources differ only because they answer different questions, and his broadcast that evening was made after he was no longer king. The signing is filed as its own event so the two dates need not compete.',
       'note-the-abdication-has-a-date-and-it-is-not-the-one-people'
 WHERE NOT EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-abdication')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-cl-abdication');
INSERT INTO claim_subjects (id, claim_id, subject_object_id, role)
SELECT 'mon-cs-abdication', 'mon-cl-abdication', 'mon-edward8', 'subject'
 WHERE NOT EXISTS (SELECT 1 FROM claim_subjects WHERE id = 'mon-cs-abdication')
   AND EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-abdication');
INSERT INTO claim_evidence (id, claim_id, evidence_object_id, evidence_role, evidence_classification_id, locator, notes)
SELECT 'mon-ce-abdication-1', 'mon-cl-abdication', 'mon-art-abdication', 'supports', 'evidence_official_record',
       'His Majesty''s Declaration of Abdication Act 1936', 'The statute that gave the signature effect, and so the instrument that ended the reign.'
 WHERE NOT EXISTS (SELECT 1 FROM claim_evidence WHERE id = 'mon-ce-abdication-1')
   AND EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-abdication')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-art-abdication');

-- 6. Wallis Simpson's birth: Possible and open. The weakest statement here.
INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-cl-wallis-birth', 'claim', 'She was born on 19 June 1896.', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-cl-wallis-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-wallis');
INSERT INTO claims (id, statement, claim_type, subject_object_id, date_text, confidence_level_id, confidence_score, status, notes, research_section)
SELECT 'mon-cl-wallis-birth', 'She was born on 19 June 1896.', 'date', 'mon-wallis', '19 June 1896',
       'confidence_possible', 25, 'open',
       'The date she gave and the one generally printed, resting on no birth certificate: Pennsylvania required no statewide registration until 1906 and the resort kept no surviving register. 1895 and 1897 both appear in other accounts, and her own statements are not perfectly consistent. One self-reported date, no contemporaneous record, known variation -- the weakest-supported statement in this archive, and left open.',
       'note-her-birth-date-rests-on-no-certificate'
 WHERE NOT EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-wallis-birth')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-cl-wallis-birth');
INSERT INTO claim_subjects (id, claim_id, subject_object_id, role)
SELECT 'mon-cs-wallis-birth', 'mon-cl-wallis-birth', 'mon-wallis', 'subject'
 WHERE NOT EXISTS (SELECT 1 FROM claim_subjects WHERE id = 'mon-cs-wallis-birth')
   AND EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-wallis-birth');

-- 7. Elizabeth II's birthplace: Confirmed, with no anchor needed beyond its own note.
INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-cl-e2-birth', 'claim', 'She was born at 17 Bruton Street, Mayfair.', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-cl-e2-birth')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-elizabeth2');
INSERT INTO claims (id, statement, claim_type, subject_object_id, date_text, confidence_level_id, confidence_score, status, notes, research_section)
SELECT 'mon-cl-e2-birth', 'She was born at 17 Bruton Street, Mayfair.', 'place', 'mon-elizabeth2', '21 April 1926',
       'confidence_confirmed', 95, 'supported',
       'Her maternal grandfather''s London house, not a palace. The birth was registered in the ordinary way and the record is unambiguous. The building no longer stands. Her June Official Birthday is a scheduling convention and is not a competing claim about the date.',
       'note-born-in-a-private-house-not-a-palace'
 WHERE NOT EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-e2-birth')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-cl-e2-birth');
INSERT INTO claim_subjects (id, claim_id, subject_object_id, role)
SELECT 'mon-cs-e2-birth', 'mon-cl-e2-birth', 'mon-elizabeth2', 'subject'
 WHERE NOT EXISTS (SELECT 1 FROM claim_subjects WHERE id = 'mon-cs-e2-birth')
   AND EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-e2-birth');

-- 8. Victoria and Albert's kinship: Confirmed, and with no anchor at all --
--    the fallback case, where the link opens the note at its top.
INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT 'mon-cl-cousins', 'claim', 'She and Albert were first cousins.', 'public', 0, datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-cl-cousins')
   AND EXISTS (SELECT 1 FROM persons WHERE id = 'mon-victoria');
INSERT INTO claims (id, statement, claim_type, subject_object_id, confidence_level_id, confidence_score, status, notes, research_section)
SELECT 'mon-cl-cousins', 'She and Albert were first cousins.', 'relationship', 'mon-victoria',
       'confidence_confirmed', 95, 'supported',
       'Victoria''s mother, Princess Victoria of Saxe-Coburg-Saalfeld, and Albert''s father, Ernest I, Duke of Saxe-Coburg and Gotha, were sister and brother. The descent is on record on both sides and is not in dispute. No section anchor is recorded for this one: the reasoning is a pedigree rather than an argument, and there is no passage of prose to point at.',
       NULL
 WHERE NOT EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-cousins')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-cl-cousins');
INSERT INTO claim_subjects (id, claim_id, subject_object_id, role)
SELECT 'mon-cs-cousins', 'mon-cl-cousins', 'mon-victoria', 'subject'
 WHERE NOT EXISTS (SELECT 1 FROM claim_subjects WHERE id = 'mon-cs-cousins')
   AND EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-cousins');
INSERT INTO claim_subjects (id, claim_id, subject_object_id, role)
SELECT 'mon-cs-cousins-2', 'mon-cl-cousins', 'mon-albert', 'subject'
 WHERE NOT EXISTS (SELECT 1 FROM claim_subjects WHERE id = 'mon-cs-cousins-2')
   AND EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-cousins')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-albert');

-- ─────────────────────────────────────────────────────────────────────────────
-- ARCHIVE OBJECTS FOR THE EVENTS
--
-- EventRepository.create writes an archive_objects row for every event it
-- makes, so an event in this app is an archive object like anything else --
-- that is what lets a relationship, a collection or a claim point at one. The
-- events above were inserted as raw SQL and so had no such row, which left the
-- seeded tree subtly unlike anything the application itself would produce: the
-- marriage events the startup backfill creates had archive objects and these
-- did not.
--
-- Derived from the events themselves rather than written out per event, so it
-- stays correct if the list above changes, and guarded so it adds only what is
-- missing.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
SELECT e.id, 'event',
       CASE e.event_type
         WHEN 'birth'  THEN 'Birth of '  || ao.title
         WHEN 'death'  THEN 'Death of '  || ao.title
         WHEN 'burial' THEN 'Burial of ' || ao.title
         ELSE e.event_type || ' of ' || ao.title
       END,
       'public', 0, datetime('now'), datetime('now')
  FROM events e
  JOIN archive_objects ao ON ao.id = e.person_id
 WHERE e.id LIKE 'mon-%'
   AND NOT EXISTS (SELECT 1 FROM archive_objects a2 WHERE a2.id = e.id);

-- ─────────────────────────────────────────────────────────────────────────────
-- WHICH FACT A CLAIM GOVERNS
--
-- A claim_subjects row with role = 'governs' names the event whose displayed
-- date a claim marks. Without one the person page matches a date claim to an
-- event by year, which cannot tell a birth from a baptism four days later.
-- Wallis Warfield's 1896 birth date would have been matched correctly anyway,
-- so this row changes nothing a reader sees -- it is here so the development
-- tree exercises the stored path at all, rather than only the fallback.
--
-- After the block above, because the link points at the event's archive object
-- and that is where those rows are made.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO claim_subjects (id, claim_id, subject_object_id, role)
SELECT 'mon-cs-wallis-birth-governs', 'mon-cl-wallis-birth', 'mon-wallis-birth', 'governs'
 WHERE NOT EXISTS (SELECT 1 FROM claim_subjects WHERE id = 'mon-cs-wallis-birth-governs')
   AND EXISTS (SELECT 1 FROM claims WHERE id = 'mon-cl-wallis-birth')
   AND EXISTS (SELECT 1 FROM archive_objects WHERE id = 'mon-wallis-birth');
