## Goal

Inside the repository view (mother or child repo), add an **"Add folder"** button. The user picks a folder name and one of three sources:

1. **Upload from computer** — pick a local folder; every file inside is committed to that path in the repo, then auto-synced across the sync group.
2. **Empty directory** — creates the folder with a `.gitkeep`.
3. **Link from another GitHub repo** — pick a source repo (+ optional subpath). Its files are copied into the new folder once, and a link is saved. Whenever that *source* repo receives a push, **only that folder** is updated in the destination repo — not the whole repo.

Also: investigate and fix why webhook auto-sync isn't firing.

---

## Why auto-sync isn't firing (diagnosis)

Looking at the existing edge functions:

- `github-webhook` is correct and `verify_jwt = false` in `config.toml` ✔︎
- `register-webhook` creates a GitHub hook pointing at `/functions/v1/github-webhook` ✔︎
- The most likely root causes (in order):
  1. **No `GITHUB_WEBHOOK_SECRET` configured AND the GitHub hook was created with a secret on a previous run** (or vice versa). The HMAC then mismatches and every delivery 401s.
  2. **Webhook was never actually registered** for the repos in the sync group (the UI requires the user to open Webhook Manager and click register; nothing registers automatically when a repo is added to a group).
  3. The GitHub OAuth token lacks `admin:repo_hook` scope, so silent 404s on registration.

Fix plan: (a) generate `GITHUB_WEBHOOK_SECRET` if missing, (b) auto-call `register-webhook` whenever a repo is added to a sync group (and surface failures clearly), (c) add a visible "Webhook status" pill on each repo with one-click re-register, (d) log webhook deliveries to a new `webhook_events` table so we can see what's arriving.

---

## What I'll build

### 1. New DB tables (migration)

```text
linked_folders
  id uuid pk
  dest_repo_id uuid  -> repos.id          (repo the folder lives in)
  dest_path text                          (folder path inside dest repo)
  source_repo_full_name text              (e.g. "owner/name")
  source_subpath text                     ("" = whole repo)
  source_ref text default 'main'
  last_synced_sha text
  auto_sync boolean default true
  account_id uuid                         (which github account to use)
  created_at, updated_at
  unique(dest_repo_id, dest_path)

webhook_events                            (diagnostics)
  id, repo_full_name, event_type, delivery_id,
  signature_valid bool, processed bool, error text,
  payload_summary jsonb, created_at
```

Plus GRANTs + RLS as per project rules.

### 2. Edge functions

- **`github-upload-folder`** — accepts `{ accountId, repoFullName, basePath, files: [{path, contentBase64}], commitMessage }`. Uses the Git Data API (create blobs → tree → commit → update ref) so the whole folder lands in one commit.
- **`github-create-empty-folder`** — commits a single `<basePath>/.gitkeep`.
- **`link-folder`** — creates a `linked_folders` row, registers a webhook on the **source** repo, does an initial copy by calling `sync-linked-folder`.
- **`sync-linked-folder`** — given a `linked_folders` row (or source repo + push payload), diffs source `<subpath>` against `dest_repo/<dest_path>`, then writes only the changed files into the dest repo as **one commit** scoped to that folder.
- **`github-webhook` (update)** — on push:
  1. Always log to `webhook_events`.
  2. Existing sync-group flow (unchanged).
  3. **New**: look up `linked_folders` where `source_repo_full_name = payload.repository.full_name`. For each match, inspect `payload.commits[].added/modified/removed` — if any path starts with `source_subpath`, trigger `sync-linked-folder` for that one row. This guarantees "only that folder updates, and only when the commit touched it."
- **`register-webhook` (no change)** — but called automatically from `link-folder` and from "Add repo to group".

### 3. Frontend

- **`AddFolderDialog`** component opened from a new **"Add folder"** button in `RepositoryBrowser`'s breadcrumb bar. Three tabs:
  - *Upload* — `<input type="file" webkitdirectory>` + folder-name field + commit message → calls `github-upload-folder`.
  - *Empty* — folder-name field → calls `github-create-empty-folder`.
  - *Link repo* — repo picker (lists user's repos via existing `github-repos`), optional subpath, "Auto-sync on push" toggle → calls `link-folder`.
- Linked folders show a small **link icon + "synced from owner/name"** badge in the file tree (data from `linked_folders`).
- Each folder row in the tree gets a **"⋯ Unlink / Sync now"** menu when it's a linked folder.
- Webhook status pill on the repo header with one-click re-register; uses the new `webhook_events` table to show "last delivery 2 min ago".

### 4. Auto-sync fix tasks

- Generate `GITHUB_WEBHOOK_SECRET` if not set (via `generate_secret`).
- On "Add repo to group" success, automatically call `register-webhook` and toast the result.
- Add a `webhook_events` viewer in the project page (small "Webhook activity" panel) so the user can see real-time deliveries — confirms whether GitHub is even calling us.

### 5. Loop-safety

- Sync commits already use prefix `Synced from `; folder-link commits will use `Synced folder <path> from <source>` and the webhook will ignore both prefixes.

---

## Files touched

```text
supabase/migrations/<ts>_linked_folders.sql            (new)
supabase/functions/github-upload-folder/index.ts       (new)
supabase/functions/github-create-empty-folder/index.ts (new)
supabase/functions/link-folder/index.ts                (new)
supabase/functions/sync-linked-folder/index.ts         (new)
supabase/functions/github-webhook/index.ts             (extend)
supabase/config.toml                                   (register 4 new fns, verify_jwt=false)
src/components/dashboard/AddFolderDialog.tsx           (new)
src/components/dashboard/RepositoryBrowser.tsx         (add "Add folder" button + linked-folder badges)
src/components/dashboard/WebhookActivity.tsx           (new — shows webhook_events tail)
src/pages/SyncProject.tsx                              (mount WebhookActivity)
```

No changes to mother/child sync-group logic; this is additive.

---

## Open question

For the **upload** path on big folders, GitHub's contents API is one-file-per-commit (noisy history). I'll use the **Git Data API** (single commit for the whole folder) — slightly more code but the right behavior. Confirm that's OK, or say "one commit per file is fine" and I'll use the simpler path.
