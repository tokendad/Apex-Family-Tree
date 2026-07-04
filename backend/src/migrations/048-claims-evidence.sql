-- Apex Family Legacy 2.0 claims, evidence, and confidence.
-- Artifact-to-claim support uses claim_evidence as the canonical evidence path.

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE,
  statement TEXT NOT NULL,
  claim_type TEXT,
  subject_object_id TEXT REFERENCES archive_objects(id),
  date_text TEXT,
  date_start TEXT,
  date_end TEXT,
  confidence_level_id TEXT REFERENCES confidence_levels(id),
  confidence_score INTEGER CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'supported', 'conflicted', 'rejected', 'unknown')),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS claim_subjects (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  subject_object_id TEXT NOT NULL REFERENCES archive_objects(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'subject',
  UNIQUE (claim_id, subject_object_id, role)
);

CREATE TABLE IF NOT EXISTS claim_evidence (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  evidence_object_id TEXT NOT NULL REFERENCES archive_objects(id) ON DELETE CASCADE,
  evidence_role TEXT NOT NULL DEFAULT 'supports' CHECK (evidence_role IN ('supports', 'contradicts', 'mentions', 'uncertain')),
  evidence_classification_id TEXT REFERENCES evidence_classifications(id),
  excerpt TEXT,
  locator TEXT,
  weight_score INTEGER CHECK (weight_score IS NULL OR weight_score BETWEEN 0 AND 100),
  confidence_contribution INTEGER CHECK (confidence_contribution IS NULL OR confidence_contribution BETWEEN 0 AND 100),
  notes TEXT,
  UNIQUE (claim_id, evidence_object_id, evidence_role)
);

CREATE INDEX IF NOT EXISTS idx_claims_subject ON claims(subject_object_id);
CREATE INDEX IF NOT EXISTS idx_claims_confidence ON claims(confidence_level_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claim_subjects_claim ON claim_subjects(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_subjects_subject ON claim_subjects(subject_object_id);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_claim ON claim_evidence(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_object ON claim_evidence(evidence_object_id);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_role ON claim_evidence(evidence_role);
