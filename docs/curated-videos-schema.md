# Curated Videos — Firestore Schema Reference

## Collection: `curatedVideos`

**Document ID:** YouTube `videoId` (e.g. `dQw4w9WgXcQ`)

Each document represents one curated YouTube video. Documents are written by two sources:
- **`harvestVideos`** Cloud Function — runs every 8 hours, pulls the latest 10 videos from each followed channel
- **Admin UI** ("Add Video Manually") — admin pastes a YouTube URL, metadata + transcript fetched on demand

---

## Fields

| Field | Type | Description |
|---|---|---|
| `videoId` | `string` | YouTube video ID |
| `title` | `string` | Video title |
| `link` | `string` | Full YouTube URL (`https://www.youtube.com/watch?v={videoId}`) |
| `thumbnail` | `string` | Thumbnail URL (high-res preferred, falls back to default) |
| `channelName` | `string` | Display name of the channel |
| `channelId` | `string` | YouTube channel ID (e.g. `UCxxxxx`) |
| `publishedAt` | `string` | ISO 8601 publish date from YouTube API |
| `transcript` | `string \| null` | Plain-text transcript, capped at 100,000 chars. `null` if unavailable, disabled, or not in English. Field absent on docs created before transcripts were added — these will be backfilled by the scheduled enrichment pass. |
| `transcriptStatus` | `string` | `"available"` or `"unavailable"` once the transcript lookup has been processed. Prevents repeated transcript lookups for the same video. |
| `transcriptProcessedAt` | `Timestamp` | Server timestamp for the transcript lookup pass. |
| `transcriptSummary` | `string` | Extractive summary generated from the transcript when a transcript is available. |
| `transcriptSummaryStatus` | `string` | `"available"` or `"unavailable"` depending on whether a summary could be generated. |
| `transcriptRecordPath` | `string` | Firestore path to the full transcript object, currently `videoTranscripts/{videoId}`. |
| `transcriptSummaryUpdatedAt` | `Timestamp` | Server timestamp for the latest summary write. |
| `addedAt` | `Timestamp` | Firestore server timestamp when the doc was written/updated |
| `addedManually` | `boolean` | `true` only on manually added videos; absent on harvested videos |

---

## Transcript Notes

- Sourced from YouTube's auto-generated captions via the `youtube-transcript` npm package
- English only (`lang: "en"`)
- Capped at **100,000 characters** to stay well under Firestore's 1 MB document limit
- `null` means the video has no available English transcript — the mapping engine should skip or handle gracefully
- Field missing entirely on older docs → treat the same as `null`; those docs will receive one transcript lookup attempt from the scheduled enrichment pass
- Videos with `transcriptStatus` or `transcriptRecordPath` are treated as already processed and are skipped on later enrichment runs

---

## Collection: `videoTranscripts`

**Document ID:** YouTube `videoId`

Each document stores the fuller transcript processing object for a curated video. Documents are written by the scheduled enrichment pass that runs with `harvestVideos` every 8 hours.

| Field | Type | Description |
|---|---|---|
| `videoId` | `string` | YouTube video ID |
| `title` | `string` | Video title at time of processing |
| `link` | `string` | YouTube URL |
| `channelName` | `string` | Display name of the channel |
| `channelId` | `string` | YouTube channel ID |
| `publishedAt` | `string` | ISO 8601 publish date |
| `transcript` | `string` | Plain-text transcript |
| `summary` | `string` | Extractive transcript summary |
| `summaryMethod` | `string` | Summary implementation version, currently `extractive-v1` |
| `updatedAt` | `Timestamp` | Server timestamp for the latest write |

These documents are admin-readable only in Firestore rules. Backend processes using the Firebase Admin SDK can read them directly.

---

## Querying from Transcript Processing

```javascript
// Get all videos that have a transcript available
const snap = await db.collection("curatedVideos")
  .where("transcript", "!=", null)
  .get();

// Iterate
for (const doc of snap.docs) {
  const { videoId, title, channelName, channelId, transcript } = doc.data();
  // feed transcript into the next Mojo AI Studio process
}
```

> **Note:** Firestore does not index missing fields the same as `null`. To catch both `null` and absent `transcript`, you can query without the filter and check `doc.data().transcript` in code, or add a `hasTranscript: boolean` field to make querying cleaner — that's a candidate optimization for the mapping engine build.

---

## Related Collections

| Collection | Purpose |
|---|---|
| `followedChannels` | Channels the harvest engine pulls from. Fields: `channelId`, `channelName`, `domain`, `lastHarvested` |
| `candidateChannels` | Channels discovered by the discovery engine, pending admin approval. Fields: `channelId`, `channelName`, `description`, `suggestedDomain`, `status` (`pending`/`approved`/`rejected`) |

---

## Firebase Project

- **Project ID:** `experts-d7c3d`
- **Console:** https://console.firebase.google.com/project/experts-d7c3d/firestore
