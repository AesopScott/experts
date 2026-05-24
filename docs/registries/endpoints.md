# Firebase Cloud Functions Registry

Auto-updated by `/cross-boundary-audit`. Every Cloud Function must appear here with its trigger type, producer, consumer, auth requirements, and secrets used.

---

## `sendFormSubmissionEmail`

| Property | Value |
|----------|-------|
| **Type** | Firestore trigger — `onDocumentCreated` |
| **Trigger** | `form_submissions/{submissionId}` create |
| **Producer** | `form_submissions` collection write (from `assets/form-email.js`) |
| **Consumer** | Brevo SMTP REST API (`api.brevo.com/v3/smtp/email`) |
| **Auth** | Server-side only — no client auth required |
| **Secrets** | `BREVO_SMTP_KEY` |
| **Side effects** | Updates `form_submissions/{id}` with `status: "sent"` / `"error"`, `sentAt`, `messageId` |

---

## `harvestVideos` ✨ NEW — Task #2

| Property | Value |
|----------|-------|
| **Type** | Scheduled — `onSchedule` |
| **Schedule** | `0 */8 * * *` (every 8 hours — 3× daily) |
| **Producer** | YouTube Data API v3 — `playlistItems.list` (uploads playlist per channel) |
| **Consumer** | `followedChannels` (reads all), `curatedVideos` (batch writes) |
| **Auth** | Server-side only — no client auth |
| **Secrets** | `YOUTUBE_API_KEY` |
| **Side effects** | Sets `lastHarvested` on each `followedChannels` doc; idempotent video writes via doc ID = `videoId` |
| **Quota cost** | 1 unit per channel poll · 25 channels × 3 polls/day ≈ 75 units/day |

---

## `discoverChannels` ✨ NEW — Task #2

| Property | Value |
|----------|-------|
| **Type** | Scheduled — `onSchedule` |
| **Schedule** | `0 0 * * *` (midnight UTC — once daily) |
| **Producer** | YouTube Data API v3 — `search.list` (5 fixed AI-topic queries) |
| **Consumer** | `followedChannels` (reads for dedup), `candidateChannels` (reads for dedup, batch writes) |
| **Auth** | Server-side only — no client auth |
| **Secrets** | `YOUTUBE_API_KEY` |
| **Side effects** | Writes new `pending` docs to `candidateChannels`; skips channels already in followed or candidate lists |
| **Quota cost** | 100 units per search · 5 queries ≈ 500 units/day |

---

## `lookupChannel` ✨ NEW — Task #2

| Property | Value |
|----------|-------|
| **Type** | HTTPS callable — `onCall` |
| **Producer** | `admin.html` — `lookupChannelFn({ channelUrl })` |
| **Consumer** | YouTube Data API v3 — `channels.list` (by `id` or `forHandle`) |
| **Auth** | Required — `request.auth` checked; throws `HttpsError("unauthenticated")` if absent |
| **Secrets** | `YOUTUBE_API_KEY` |
| **Input** | `{ channelUrl: string }` — `youtube.com/@handle` or `youtube.com/channel/UC…` |
| **Output** | `{ channelId, channelName, description, subscriberCount, thumbnailUrl }` |
| **Quota cost** | 1 unit per call |

---

## `fetchVideoMetadata` ✨ NEW — Task #2

| Property | Value |
|----------|-------|
| **Type** | HTTPS callable — `onCall` |
| **Producer** | `admin.html` — `fetchVideoMetadataFn({ videoUrl })` |
| **Consumer** | YouTube Data API v3 — `videos.list` (by video ID) |
| **Auth** | Required — `request.auth` checked; throws `HttpsError("unauthenticated")` if absent |
| **Secrets** | `YOUTUBE_API_KEY` |
| **Input** | `{ videoUrl: string }` — `youtube.com/watch?v=…` or `youtu.be/…` |
| **Output** | `{ videoId, title, channelName, channelId, publishedAt, thumbnail, link }` |
| **Quota cost** | 1 unit per call |

---

## `syncVideoToCourses` ✨ NEW — Task #3

| Property | Value |
|----------|-------|
| **Type** | HTTPS callable — `onCall` (manually triggered from admin page or scheduled via Cloud Tasks) |
| **Producer** | `admin.html` — manual trigger button on Unmatched Videos section |
| **Producer** | `videos.html` — admin-only manual picker can open the course catalog for each video card |
| **Consumer** | `curatedVideos` collection (reads: videoId, title, transcript; batch mode orders by `publishedAt`) |
| **Consumer** | Aesop Academy REST API v1 — `GET https://aesopacademy.org/aesop-api/catalog.php` |
| **Consumer** | `videoCourseMappings` collection (writes mappings + scores) |
| **Consumer** | Email service (Brevo SMTP) — sends alerts on API failure to `ravenshroud@gmail.com` |
| **Consumer** | `admin.html` — receives response with sync status, updates UI alert |
| **Consumer** | `videos.html` — reads catalog for manual course search/selection |
| **Auth** | Required — `request.auth` checked; throws `HttpsError("unauthenticated")` if absent |
| **Secrets** | `BREVO_SMTP_KEY` (for email alerts on API failure) |
| **Input** | `{ videoId?: string }` (optional; if omitted, syncs up to 10 unsynced videos) |
| **Output** | `{ success: boolean, videosProcessed: number, coursesMatched: number, error?: string }` |
| **Side effects** | Writes `videoCourseMappings/{videoId}` doc; sends email if Aesop Academy API fails; updates admin page status indicator |
| **Quota cost** | ~50 quota units per video (YouTube transcript lookup + OpenAI analysis + Aesop API call) |

---

## Summary

| Function | Type | Trigger | Producers | Consumers | Status |
|----------|------|---------|-----------|-----------|--------|
| `sendFormSubmissionEmail` | Firestore trigger | `form_submissions` create | form-email.js | Brevo SMTP API | ✓ |
| `harvestVideos` | Scheduled | every 8 hours | YouTube Data API | followedChannels, curatedVideos | ✓ |
| `discoverChannels` | Scheduled | daily (midnight UTC) | YouTube Data API | followedChannels, candidateChannels | ✓ |
| `lookupChannel` | HTTPS callable | admin.html | admin.html | YouTube Data API | ✓ |
| `fetchVideoMetadata` | HTTPS callable | admin.html | admin.html | YouTube Data API | ✓ |
| `syncVideoToCourses` | HTTPS callable | admin.html (manual trigger) | curatedVideos, Aesop Academy API | videoCourseMappings, email service, admin.html | ✓ |

---

## Audit Trail

**Last audit:** 2026-05-23T22:00:00Z (by /cross-boundary-audit, Task #3 complete)

**Boundaries checked:** Cloud Functions (triggers, producers, consumers, secrets)

**Evidence recorded:**
- 6 entries with complete producer/consumer pairs ✓
- 0 entries with gaps
- 0 entries with shape mismatches
- New identifiers from Task #3: `syncVideoToCourses` function (added with full integration)
- Registries match current code: yes ✓

**Gaps identified:** none

**Status:** Audit complete
