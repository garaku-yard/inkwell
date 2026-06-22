-- Vault sync follow-ups:
-- 1) mtime/size fast-path — store each manifest file's last-seen modification
--    time + size so a sync can skip re-reading+re-hashing files whose (mtime,
--    size) are unchanged. Big vaults no longer hash every file every sync.
--    Existing rows default to ('', 0), which matches no real stat, so the first
--    sync after upgrade re-hashes once (safe) and then the fast-path kicks in.
-- 2) sync_state.notice — a non-fatal, per-project heads-up line (status stays
--    idle), e.g. "N file(s) over 20 MB weren't synced". Surfaced in the UI.

ALTER TABLE vault_manifest ADD COLUMN mtime TEXT NOT NULL DEFAULT '';
ALTER TABLE vault_manifest ADD COLUMN size INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_state ADD COLUMN notice TEXT;
