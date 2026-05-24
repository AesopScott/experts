# Firebase Secret Manager Registry

Auto-updated by `/cross-boundary-audit`. Every secret accessed via `defineSecret` must appear here with who sets it, which functions consume it, and what it authenticates against.

---

## `BREVO_SMTP_KEY`

| Property | Value |
|----------|-------|
| **Set by** | Manual — `firebase functions:secrets:set BREVO_SMTP_KEY` |
| **Consumer(s)** | `functions/index.js` · `sendFormSubmissionEmail` |
| **Consumer(s)** | `functions/src/syncVideoToCourses.js` — sends email alerts on Aesop Academy API failure (Task #3) |
| **Authenticates against** | Brevo SMTP REST API (`api.brevo.com`) |
| **Rotation** | Manual — update in Secret Manager, redeploy function |

---

## `YOUTUBE_API_KEY` ✨ NEW — Task #2

| Property | Value |
|----------|-------|
| **Set by** | Manual — `firebase functions:secrets:set YOUTUBE_API_KEY` (done: 2026-05-23) |
| **Consumer(s)** | `functions/index.js` · `harvestVideos`, `discoverChannels`, `lookupChannel`, `fetchVideoMetadata` |
| **Authenticates against** | YouTube Data API v3 (`googleapis.com/youtube/v3`) |
| **Quota** | 10,000 units/day free · projected usage ≈ 625 units/day (after Task #3 adds syncVideoToCourses) |
| **Rotation** | Manual — rotate in Google Cloud Console, update Secret Manager, redeploy functions |
| **Security note** | Key must never be committed to git or hardcoded in any file — Secret Manager only |

---

## `OPENAI_API_KEY` ✨ NEW — Task #3

| Property | Value |
|----------|-------|
| **Set by** | Manual — `firebase functions:secrets:set OPENAI_API_KEY` (pending) |
| **Consumer(s)** | `functions/index.js` · `syncVideoToCourses` — extracts learning concepts from video transcripts |
| **Authenticates against** | OpenAI API (`api.openai.com`) via Node.js SDK v4.104.0 |
| **Model** | `gpt-4o-mini` (cost-optimized for transcript concept extraction) |
| **Rotation** | Manual — rotate in OpenAI Dashboard, update Secret Manager, redeploy functions |
| **Security note** | Key must never be committed to git or hardcoded in any file — Secret Manager only |

---

## Summary

| Secret | Set by | Consumer(s) | Status |
|--------|--------|-------------|--------|
| `BREVO_SMTP_KEY` | Manual | sendFormSubmissionEmail, syncVideoToCourses | ✓ |
| `YOUTUBE_API_KEY` | Manual | harvestVideos, discoverChannels, lookupChannel, fetchVideoMetadata | ✓ |
| `OPENAI_API_KEY` | Manual | syncVideoToCourses | ⧖ pending |

---

## Audit Trail

**Last audit:** 2026-05-23T22:00:00Z (by /cross-boundary-audit, Task #3 complete)

**Boundaries checked:** Firebase Secret Manager keys

**Evidence recorded:**
- 3 entries with complete producer/consumer pairs ✓
- 0 entries with gaps
- 0 entries with rotation mismatches
- New identifiers from Task #3: `OPENAI_API_KEY` (added for syncVideoToCourses concept extraction)
- Registries match current code: yes ✓

**Summary:** All Task #3 secrets defined and documented. OPENAI_API_KEY pending deployment (manual setup required before production). No new gaps introduced.

**Status:** Audit complete
