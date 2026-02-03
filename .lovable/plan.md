

# Plan: Fix Sync Errors and Add Timer/Status Features

## Summary
This plan addresses the "Invalid Blob SHA" error causing sync failures, adds a live timer during sync operations, and improves the display of last sync time and error information.

---

## Issues Identified

### Error Analysis
Two recent syncs failed with this error:
```
Failed to create tree: "tree.sha is not a valid blob"
```

**Why it happens**: When a blob fails to be created in the target repository (due to network issues, rate limits, or API errors), the code still attempts to include that file in the tree with an invalid or missing SHA, causing GitHub to reject the entire tree creation.

### Current Sync Status
- A sync is running for `emuserclone1` → `heartfelt-helper`
- Progress: 500/677 files (~74% complete)
- Large syncs like this take 5-10 minutes depending on file count

---

## Implementation Plan

### Task 1: Fix "Invalid Blob SHA" Error
**File**: `supabase/functions/sync-repos/index.ts`

**Problem**: Files that fail blob creation are silently skipped but the error isn't properly tracked, and the tree may still contain references to source blob SHAs.

**Solution**:
1. Track failed blob creations separately
2. Only add files to the tree if they have valid newly-created blob SHAs
3. Skip files that failed blob creation rather than crashing
4. Add better error logging to identify which files cause issues
5. Add validation before tree creation to filter out any invalid entries

```text
Changes:
- Add a failedFiles array to track blob creation failures
- Verify blob SHA validity (40-char hex string) before adding to tree
- Log detailed information about skipped files
- Continue sync for remaining valid files instead of failing entirely
```

### Task 2: Add Sync Timer
**File**: `src/components/dashboard/SyncProgressModal.tsx`

**Changes**:
1. Add state to track sync start time
2. Add a timer that updates every second showing elapsed time (MM:SS format)
3. Display the timer prominently in the modal header
4. Stop the timer when sync completes

```text
UI Layout:
┌─────────────────────────────────────────┐
│ Sync Progress           ⏱️ 02:34        │
│ Syncing from: source-repo               │
├─────────────────────────────────────────┤
│ Overall Progress       4/6 repos        │
│ ████████████████░░░░░░░░░ 67%           │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🔄 repo-name          [syncing]    │ │
│ │    Processing: file.ts             │ │
│ │    Files: 45/100 (45%)             │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Task 3: Show Last Sync Time and Status
**File**: `src/components/dashboard/ProjectMainContent.tsx`

**Changes**:
1. Fetch the most recent sync_history record for the project
2. Display last sync time with relative format (e.g., "5 minutes ago")
3. Show last sync status (success/failed) with appropriate color
4. Show file change counts from last sync (+X added, ~Y changed, -Z deleted)

```text
Mother Repository Card:
┌─────────────────────────────────────────┐
│ 🔀 repository-name          [Mother]    │
│ user/repository-name                    │
│                                         │
│ Branch: main                            │
│ Last sync: 5 minutes ago ✓              │
│ Changes: +3 ~2 -1 files                 │
└─────────────────────────────────────────┘
```

### Task 4: Improve Error Display in Right Sidebar
**File**: `src/components/dashboard/ProjectRightSidebar.tsx`

**Changes**:
1. For failed syncs, show the error message truncated with tooltip for full error
2. Add visual distinction between success and failed items
3. Add a "Recent Failures" section at the top if any failures exist

---

## Technical Details

### Database Query for Last Sync
```sql
SELECT * FROM sync_history 
WHERE account_id = :account_id 
ORDER BY synced_at DESC 
LIMIT 1
```

### Timer Implementation
```typescript
// In SyncProgressModal
const [startTime] = useState(Date.now());
const [elapsedSeconds, setElapsedSeconds] = useState(0);

useEffect(() => {
  if (!allCompleted) {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }
}, [allCompleted, startTime]);

// Format as MM:SS
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};
```

### Blob Validation Fix
```typescript
// Before adding to tree, validate blob
const isValidBlobSha = (sha: string | null): boolean => {
  return sha !== null && 
         typeof sha === 'string' && 
         sha.length === 40 && 
         /^[a-f0-9]+$/i.test(sha);
};

// Only add valid blobs
for (const [path, blob] of blobMap.entries()) {
  if (!isValidBlobSha(blob.sha)) {
    console.warn(`Skipping ${path}: invalid blob SHA`);
    skippedFiles.push(path);
    continue;
  }
  newTreeItems.push({ path, mode: blob.mode, type: 'blob', sha: blob.sha });
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/sync-repos/index.ts` | Add blob validation, better error handling |
| `src/components/dashboard/SyncProgressModal.tsx` | Add elapsed time timer |
| `src/components/dashboard/ProjectMainContent.tsx` | Show last sync time and status |
| `src/components/dashboard/ProjectRightSidebar.tsx` | Improve error display for failures |

---

## Expected Outcome

After implementation:
- **No more "Invalid Blob SHA" errors** - proper validation prevents bad data
- **Live timer** - users see exactly how long sync is taking (e.g., "⏱️ 02:34")
- **Last sync info** - shows "Last sync: 5 min ago ✓" with file counts
- **Clear error display** - failed syncs show readable error messages

