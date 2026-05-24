# Video-Course Mappings — Firestore Schema Reference

## Collection: `videoCourseMappings`

**Document ID:** YouTube `videoId` (e.g. `dQw4w9WgXcQ`)

Each document represents the synchronized mapping between a curated YouTube video and relevant Aesop Academy courses. Documents are created by the `syncVideoToCourses` Cloud Function as it processes videos from the `curatedVideos` collection.

---

## Fields

| Field | Type | Description |
|-------|------|-------------|
| `videoId` | `string` | YouTube video ID (doc ID, matches `curatedVideos` doc ID) |
| `courses` | `array` | Array of matched courses. Empty array if no matches found. |
| `courses[].id` | `string` | Aesop Academy course ID (e.g., `ai-and-creativity`) |
| `courses[].name` | `string` | Human-readable course name (e.g., `AI & Creativity`) |
| `courses[].desc` | `string` | Course blurb/description from Aesop Academy |
| `courses[].url` | `string` | Full URL to course on Aesop Academy |
| `courses[].live` | `boolean` | Whether the course is currently live (true) or coming-soon (false) |
| `courses[].relevanceScore` | `number` | Relevance score 0-1 (higher = more relevant). Courses ranked descending by this score. |
| `hasCourses` | `boolean` | `true` if `courses` array has 1+ matches, `false` if no matches found. Enables efficient admin queries. |
| `syncedAt` | `Timestamp` | Firestore server timestamp when this mapping was created or last updated |
| `error` | `string` | (Optional) Error message if the last sync attempt failed. Present only on failed syncs. |

---

## Querying from Admin Page

```javascript
// Get all videos WITHOUT matched courses (unmatched videos list)
const snap = await db.collection("videoCourseMappings")
  .where("hasCourses", "==", false)
  .orderBy("syncedAt", "desc")
  .get();

// Get all videos WITH matched courses
const snap = await db.collection("videoCourseMappings")
  .where("hasCourses", "==", true)
  .get();

// Get a specific video's mappings
const doc = await db.collection("videoCourseMappings").doc(videoId).get();
const { courses, syncedAt, error } = doc.data();
```

---

## Related Collections

| Collection | Purpose |
|-----------|---------|
| `curatedVideos` | Source videos that are analyzed and matched to courses |
| `followedChannels` | Channels the harvest engine pulls from |

---

## Firebase Project

- **Project ID:** `experts-d7c3d`
- **Console:** https://console.firebase.google.com/project/experts-d7c3d/firestore
