-- Transaction-scoped assertion rows for the command path.
--
-- A D1 batch is one transaction, but D1 offers no interactive transaction with
-- conditional rollback. These rows give a command a way to abort its batch: the CHECK
-- constraint rejects `ok = 0`, so a failed optimistic version check rolls the entire
-- command back rather than committing a prefix of it. Rows are inserted and deleted
-- inside the same batch and never survive it.

CREATE TABLE IF NOT EXISTS command_assertions (
  workspace_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  ok INTEGER NOT NULL CHECK (ok = 1),
  PRIMARY KEY (workspace_id, seq)
);
