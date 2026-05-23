# Firebase Secret Manager Registry

Auto-updated by `/cross-boundary-audit`. Every secret accessed via `defineSecret` must appear here with who sets it, which functions consume it, and what it authenticates against.

---

## `BREVO_SMTP_KEY`

| Property | Value |
|----------|-------|
| **Set by** | Manual — `firebase functions:secrets:set BREVO_SMTP_KEY` |
| **Consumer(s)** | `functions/index.js` · `sendFormSubmissionEmail` |
| **Authenticates against** | Brevo SMTP REST API (`api.brevo.com`) |
| **Rotation** | Manual — update in Secret Manager, redeploy function |

---

## `YOUTUBE_API_KEY` ✨ NEW — Task #2

| Property | Value |
|----------|-------|
| **Set by** | Manual — `firebase functions:secrets:set YOUTUBE_API_KEY` (done: 2026-05-23) |
| **Consumer(s)** | `functions/index.js` · `harvestVideos`, `discoverChannels`, `lookupChannel`, `fetchVideoMetadata` |
| **Authenticates against** | YouTube Data API v3 (`googleapis.com/youtube/v3`) |
| **Quota** | 10,000 units/day free · projected usage ≈ 575 units/day |
| **Rotation** | Manual — rotate in Google Cloud Console, update Secret Manager, redeploy functions |
| **Security note** | Key must never be committed to git or hardcoded in any file — Secret Manager only |
