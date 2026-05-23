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
