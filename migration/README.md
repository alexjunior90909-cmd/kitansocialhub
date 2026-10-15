# Migration toolkit — what each script does

All scripts read credentials from local files only and never print secret values.

| Script | Purpose | Status |
|---|---|---|
| `01-probe.mjs` | Validate both backends; capture old schema (OpenAPI); probe table access | ✅ run — all 34 tables readable |
| `01b-keys.mjs` | Verify how the new project's keys behave | ✅ run |
| `01c-census.mjs` | Exact source row counts + order-content object enumeration | ✅ run — 45 objects found |
| `01d-functions.mjs` | Check which Edge Functions exist on the new project | ✅ run — none deployed yet |
| `02-gen-sql.mjs` | Generate `sql/00-ALL-IN-ONE.sql` (34 tables + RLS + storage policies) from the live old schema | ✅ run — awaiting manual paste |
| `03-create-buckets.mjs` | Create the 6 public Storage buckets via API | ✅ run — all 6 created & verified public |
| `04-copy-storage.mjs` | Copy order-content objects to the new project (exact paths, byte-verified read-back, resumable) | ✅ run — 44/45 OK (`logo.png` does not exist on the old backend) |
| `05-migrate-data.mjs` | Resumable table-by-table data migration (old→new, upserts on PK, byte-size-aware batches, preserves Base64 + IDs verbatim) | ⏳ blocked until tables exist |
| `06-verify.mjs` | Per-table old-vs-new row counts, anon-read policy check, per-object storage check | ⏳ run after 05 |
| `07-switch-frontend.mjs` | Point `.env` at the new project (backs up old config; refuses unless 06 passed) | ⏳ run after 06 |
| `lib/creds.mjs` | Credential loader (never logs values) | — |
| `state/` | Checkpoints: schema, counts, copy progress (gitignored) | — |

## Resume/retry semantics
- `04` skips objects already marked `ok` in `state/storage-copy.json`.
- `05` skips tables marked `done` in `state/data-migration.json`; failed tables can be retried by re-running.
- Nothing ever deletes from the old backend. Old backend credentials are only used for reads.
