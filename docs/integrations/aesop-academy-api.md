# Aesop Academy API Integration

## Overview

The Aesop Academy API integration fetches the course catalog from the live Aesop Academy API and caches it in Firestore to optimize performance and reduce API calls.

---

## Endpoint

**URL:** `https://aesopacademy.org/aesop-api/catalog.php`  
**Method:** `GET`  
**Response:** JSON catalog with courses array

---

## Caching Strategy

### Hash-Based Cache

The integration uses hash-based caching to detect catalog changes:

1. **Fetch** → Catalog from API
2. **Hash** → SHA-256 of catalog JSON
3. **Store** → Hash + catalog + timestamp in `__system__/aesop-catalog-cache`
4. **Check** → On next request, verify cache freshness by timestamp

### Cache TTL

- **Default TTL:** 24 hours
- **Fallback:** If API fails, serve stale cache (with warning)
- **Force refresh:** Set `forceRefresh=true` in `getCatalog(db, true)`

### Cache Document Structure

```javascript
{
  catalog: { courses: [...] },
  hash: "sha256hex...",
  cachedAt: Timestamp(...)
}
```

---

## Usage

### In syncVideoToCourses

```javascript
const catalog = await aesopApi.getCourseCatalog(db);
const courses = matchCoursesToConcepts(concepts, catalog);
```

### Direct Usage

```javascript
const aesopApi = require('./lib/aesop-api.js');
const db = admin.firestore();

// Use cache if fresh, fetch if stale
const catalog = await aesopApi.getCatalog(db);

// Force refresh (ignore cache)
const fresh = await aesopApi.getCatalog(db, true);

// Use mock (for testing)
const mockCatalog = await aesopApi.getCourseCatalog(db, true);
```

---

## Error Handling

### API Failure

If the Aesop Academy API is unavailable:

1. Check if cached catalog exists
2. If yes, use stale cache (log warning)
3. If no, throw error with `HttpsError("internal", ...)`
4. Send error email via Brevo SMTP

Example:
```
API Error → Fallback to cache → Warn in logs → Continue operation
API Error + No Cache → Throw error → Send alert email
```

### Network Timeout

- **Timeout:** 10 seconds (hardcoded)
- **Retry:** Built into sync function (single retry with fallback to cache)

---

## Rate Limiting

The Aesop Academy API has no documented rate limit. The caching strategy respects their infrastructure by:

- Fetching catalog only once per 24 hours
- Sharing single catalog across all video syncs in batch
- Using hash to detect changes (only cache miss on catalog update)

**Estimated usage:**
- Once per 24 hours (assuming changes are infrequent)
- ~1 API call per day maximum

---

## Costs

**API Call Cost:** Free (Aesop Academy's cost, not ours)  
**Firestore Cost:** 1 read + 1 write per 24 hours = negligible

---

## Testing

### Mock Mode

For local testing without hitting the real API:

```bash
USE_MOCK_AESOP=true node functions/test/test-sync-video-courses.js
```

### Real API Testing

```bash
# Enable with real API (requires network)
USE_MOCK_AESOP=false node functions/test/...
```

---

## Monitoring

Track Aesop Academy API health:

1. Check Firestore `__system__/aesop-catalog-cache` document
   - `cachedAt` should be within last 24 hours
   - If older, API may be failing

2. Monitor error emails to `ravenshroud@gmail.com`
   - Subject: "Sync Error: video/batch"
   - If frequent, Aesop Academy API may be down

3. Logs in Cloud Functions
   - Filter by "Aesop Academy API"
   - Check for timeout or network errors

---

## Future Improvements

- [ ] Implement webhook for catalog change notifications
- [ ] Add EDH/compression for large catalogs
- [ ] Implement incremental updates instead of full refresh
- [ ] Add rate limiting headers respect (if implemented by Aesop)
- [ ] Implement backup API endpoint if available

---

## Files

| File | Purpose |
|------|---------|
| `functions/lib/aesop-api.js` | API integration with caching |
| `functions/index.js` | Uses `aesopApi.getCourseCatalog()` in syncVideoToCourses |
| `docs/integrations/aesop-academy-api.md` | This guide |
