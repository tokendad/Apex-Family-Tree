-- Short, human-typed codes for onboarding (#39).
--
-- Distinct from invite_tokens, which is a long random secret mailed to one
-- named address. A code is read out, texted, or written down: it is not tied to
-- an address in advance, because the admin does not know who will use it until
-- they do. That is also why it is short-lived and single-use by default -- a
-- code that leaks is worth one account and expires the next day.
--
-- Stored in the clear, unlike a password or a refresh token. An admin has to be
-- able to re-read an active code to pass it on again, and anyone who can read
-- this table can already read the archive it protects.
CREATE TABLE IF NOT EXISTS invite_codes (
  id TEXT PRIMARY KEY,
  -- Normalised: upper case, no separator. What the user types is normalised
  -- the same way before lookup, so case and dashes never matter.
  code TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor', 'limited_editor', 'viewer')),
  -- Who the admin made it for, so a list of live codes is readable.
  note TEXT,
  max_uses INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_invite_codes_expires ON invite_codes(expires_at);
