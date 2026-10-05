CREATE TABLE IF NOT EXISTS demo_creation_limits (
  creator_hash TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  creations INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS count_demo_creation AFTER INSERT ON demo_workspaces
BEGIN
  INSERT INTO demo_creation_limits(creator_hash,window_start,creations)
    VALUES(NEW.creator_hash,CAST(NEW.created_at/3600 AS INTEGER),1)
    ON CONFLICT(creator_hash) DO UPDATE SET
      creations=CASE WHEN window_start=excluded.window_start THEN creations+1 ELSE 1 END,
      window_start=excluded.window_start;
END;
