# Firestore Collections Registry

Auto-updated by `/cross-boundary-audit`. Every collection that any producer writes or any consumer reads must appear here. Each entry pairs producers, consumers, security rules, and active indexes.

---

## `users/{uid}`

| Role | File | Access |
|------|------|--------|
| **Producer** | Firebase Auth (implicit on sign-up) | creates doc on first sign-in |
| **Consumer** | `admin.html` | `getDocs` (list all), `updateDoc` (role field) |
| **Consumer** | `admin.html` (auth gate) | `getDoc` to verify `role == "admin"` |

**Rules:** `auth.uid == uid` OR `isAdmin()`
**Indexes:** none

---

## `creator_calls/{id}`

| Role | File | Access |
|------|------|--------|
| **Producer** | `experts.html` | `addDoc` (public create) |
| **Consumer** | admin (Firebase Console or future admin panel) | read/update/delete via `isAdmin()` |

**Rules:** `allow create: if true` · `allow read, update, delete: if isAdmin()`
**Indexes:** none

---

## `expert_applications/{id}`

| Role | File | Access |
|------|------|--------|
| **Producer** | (application form — not yet wired to a current page) | `addDoc` (public create) |
| **Consumer** | admin | read/update/delete via `isAdmin()` |

**Rules:** `allow create: if true` · `allow read, update, delete: if isAdmin()`
**Indexes:** none

---

## `form_submissions/{id}`

| Role | File | Access |
|------|------|--------|
| **Producer** | `assets/form-email.js` | `addDoc` with field-validated payload |
| **Consumer** | `sendFormSubmissionEmail` Cloud Function | Firestore trigger; updates `status`, `sentAt`, `messageId` |

**Rules:** field-validated create (`to`, `from`, `status`, `subject`, `fields`, `readable` required) · admin read/update/delete
**Indexes:** none

---

## `jobs/{id}`

| Role | File | Access |
|------|------|--------|
| **Producer** | `postajob.html` | `addDoc` (public create, status: pending) |
| **Consumer** | `jobs.html` | `getDocs` with `where("status", "==", "live")` |
| **Consumer** | `admin.html` | `getDocs` (all statuses), `updateDoc` (status, featured) |

**Rules:** `allow read: if resource.data.status == "live" || isAdmin()` · `allow create: if true` · `allow update, delete: if isAdmin()`
**Indexes:** none

---

## `followedChannels/{id}` ✨ NEW — Task #2

| Role | File | Access |
|------|------|--------|
| **Producer** | `admin.html` | `setDoc(doc(db, "followedChannels", channelId), {...})` — add channel |
| **Producer** | `admin.html` | `setDoc` — approve candidate (moves to followed) |
| **Consumer** | `functions/index.js` · `harvestVideos` | `db.collection("followedChannels").get()` — reads all to harvest |
| **Consumer** | `functions/index.js` · `discoverChannels` | `db.collection("followedChannels").get()` — reads all for dedup |
| **Consumer** | `admin.html` | `getDocs(collection(db, "followedChannels"))` — display list |

**Rules:** `allow read, write, delete: if isAdmin()`
**Doc ID:** `channelId` (YouTube channel ID, e.g. `UCxxxxxx`)
**Fields:** `channelId`, `channelName`, `description`, `subscriberCount`, `thumbnailUrl`, `addedAt` (Timestamp), `lastHarvested` (Timestamp | null)
**Indexes:** none

---

## `curatedVideos/{id}` ✨ NEW — Task #2

| Role | File | Access |
|------|------|--------|
| **Producer** | `functions/index.js` · `harvestVideos` | `batch.set(db.collection("curatedVideos").doc(videoId), {...}, {merge:true})` |
| **Producer** | `admin.html` | `setDoc(doc(db, "curatedVideos", video.videoId), {...})` — manual add |
| **Consumer** | `videos.html` | `getDocs(query(collection(db, "curatedVideos"), orderBy("publishedAt", "desc")))` |

**Rules:** `allow read: if true` · `allow write, delete: if isAdmin()`
**Doc ID:** `videoId` (YouTube video ID — guarantees idempotent harvest)
**Fields:** `videoId`, `title`, `link`, `thumbnail`, `channelName`, `channelId`, `publishedAt` (ISO string), `addedAt` (Timestamp), `addedManually?` (bool)
**Indexes:**
- `publishedAt DESC` (auto, single-field — used by `videos.html` `orderBy`)
- `channelName ASC + publishedAt DESC` (composite — reserved for server-side channel filter queries)

---

## `candidateChannels/{id}` ✨ NEW — Task #2

| Role | File | Access |
|------|------|--------|
| **Producer** | `functions/index.js` · `discoverChannels` | `batch.set(db.collection("candidateChannels").doc(c.channelId), c)` |
| **Consumer** | `functions/index.js` · `discoverChannels` | `db.collection("candidateChannels").get()` — dedup existing candidates |
| **Consumer** | `admin.html` | `getDocs(query(..., where("status","==","pending"), orderBy("discoveredAt","desc")))` — display pending list |
| **Consumer** | `admin.html` | `updateDoc` — approve → status: "approved" · reject → status: "rejected" |

**Rules:** `allow read, write, delete: if isAdmin()`
**Doc ID:** `channelId` (YouTube channel ID)
**Fields:** `channelId`, `channelName`, `description`, `thumbnailUrl`, `discoveredAt` (Timestamp), `status` ("pending" | "approved" | "rejected")
**Indexes:**
- `status ASC + discoveredAt DESC` (composite — used by admin.html pending query)
