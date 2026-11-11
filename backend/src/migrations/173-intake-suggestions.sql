-- Issue #73 Phase 3: proactive suggestions.
--
-- 'manual' is every intake_items row to date -- a user pasted text or
-- attached a file. 'suggested' is new: an admin-triggered scan over
-- existing artifacts that already have a transcription, extracting facts
-- from text nobody asked to analyze this session. Same staging/review/
-- commit path either way, same requireFlag gate, still requires a human
-- accept -- #73's rules don't relax just because nobody typed anything.
ALTER TABLE intake_items ADD COLUMN trigger TEXT NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'suggested'));
CREATE INDEX IF NOT EXISTS idx_intake_items_trigger_source ON intake_items(trigger, source_artifact_id);
