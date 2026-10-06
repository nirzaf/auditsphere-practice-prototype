ALTER TABLE representation_reviews
  ADD COLUMN evidence_checks_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(evidence_checks_json));
