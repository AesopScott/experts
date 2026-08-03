# Video Share Analytics

The `25experts-video-share` Cloudflare Worker records one Workers Analytics Engine data point for every valid `/share/{videoId}` request.

Dataset: `video_share_events`

## Event Types

- `human_click`: likely browser/user click-through.
- `preview_scrape`: social or link-preview crawler fetching Open Graph metadata.

## Field Order

Blobs:

1. `eventType`
2. `videoId`
3. `source`
4. `medium`
5. `campaign`
6. `referrerHost`
7. `platform`
8. `country`
9. `colo`
10. `device`
11. `path`

Doubles:

1. `eventCount`
2. `crawlerCount`
3. `humanCount`

Index:

1. `videoId`

## Example Queries

```sql
SELECT
  blob2 AS videoId,
  SUM(_sample_interval * double3) AS humanClicks,
  SUM(_sample_interval * double2) AS previewScrapes
FROM video_share_events
WHERE timestamp >= NOW() - INTERVAL '7' DAY
GROUP BY videoId
ORDER BY humanClicks DESC
LIMIT 25
```

```sql
SELECT
  blob2 AS videoId,
  blob3 AS source,
  SUM(_sample_interval * double3) AS humanClicks
FROM video_share_events
WHERE timestamp >= NOW() - INTERVAL '30' DAY
  AND blob1 = 'human_click'
GROUP BY videoId, source
ORDER BY humanClicks DESC
LIMIT 50
```
