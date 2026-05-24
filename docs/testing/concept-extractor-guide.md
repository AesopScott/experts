# Concept Extractor — Learning Concepts from Video Transcripts

## Overview

The Concept Extractor analyzes video transcripts and extracts key learning concepts. These concepts are then matched against the Aesop Academy course catalog to generate relevance scores.

---

## Architecture

### Phase 1 (Current) — Placeholder

Returns stub data for UI/integration testing:

```javascript
["machine learning", "artificial intelligence", "tutorial", "technical education"]
```

### Phase 2 (Upcoming) — OpenAI Integration

Will use OpenAI's API to intelligently extract concepts from transcripts:
- Model: `gpt-4o-mini` (cost-optimized)
- Prompt: Instructs model to extract 5-10 key learning concepts
- Returns: Array of specific, actionable topics

---

## Usage

### Phase 1 (Placeholder)

```javascript
const extractor = require('../lib/concept-extractor.js');

const transcript = "Video transcript text here...";
const concepts = await extractor.extractConcepts(transcript);
// Returns: ["machine learning", "artificial intelligence", ...]
```

### Phase 2 (Production)

```javascript
const { OpenAI } = require('openai');
const extractor = require('../lib/concept-extractor.js');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const concepts = await extractor.extractConceptsWithOpenAI(
  transcript,
  client,
  "gpt-4o-mini"
);
```

---

## Integration in syncVideoToCourses

Once implemented, the flow will be:

```
1. Get curatedVideos doc (includes transcript)
   ↓
2. Extract concepts using OpenAI
   ↓
3. Search Aesop Academy catalog for matching courses
   ↓
4. Score courses by relevance
   ↓
5. Write videoCourseMappings doc
```

Code sketch:
```javascript
exports.syncVideoToCourses = onCall({
  secrets: [brevoApiKey, openaiApiKey],
}, async request => {
  const { videoId } = request.data;

  // Get transcript
  const videoDoc = await db.collection("curatedVideos").doc(videoId).get();
  const transcript = videoDoc.data().transcript;

  // Extract concepts
  const client = new OpenAI({ apiKey: openaiApiKey.value() });
  const concepts = await extractConceptsWithOpenAI(transcript, client);

  // Match courses
  const response = await fetch("https://aesopacademy.org/aesop-api/catalog.php");
  const catalog = await response.json();
  const matches = matchCoursesToConcepts(concepts, catalog);

  // Write results
  await db.collection("videoCourseMappings").doc(videoId).set({
    videoId,
    courses: matches,
    hasCourses: matches.length > 0,
    syncedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
});
```

---

## Testing

### Unit Tests

```bash
node functions/test/test-concept-extractor.js
```

Tests cover:
- ✓ Basic concept extraction
- ✓ Empty transcript handling
- ✓ Whitespace handling
- ✓ Output structure validation

### Integration Test (Phase 2)

```bash
# Mock the Aesop Academy API
USE_MOCK_AESOP=true firebase emulators:start

# Then test syncVideoToCourses with sample data
```

---

## Prompt Engineering (Phase 2)

The OpenAI prompt extracts specific, actionable concepts:

**System Prompt:**
```
You are an expert instructional designer analyzing video transcripts.
Extract 5-10 key learning concepts from the transcript. These should be:
- Specific, actionable topics (not generic like "introduction" or "conclusion")
- Topics that Aesop Academy courses might cover
- Sorted by importance/frequency in the transcript

Return as a JSON array of strings.
```

**User Prompt:**
```
Transcript:
[first 4000 chars of transcript]

Extract key learning concepts as a JSON array.
```

---

## Cost Considerations

Using `gpt-4o-mini` for concept extraction:
- ~$0.0001-0.0002 per video (rough estimate)
- 100 videos = ~$0.01-0.02
- Cost-effective compared to full GPT-4

---

## Error Handling

Phase 2 error handling:
```javascript
try {
  const concepts = await extractConceptsWithOpenAI(transcript, client);
} catch (error) {
  // Log detailed error
  console.error("Concept extraction failed:", error.message);

  // Send email alert (via Brevo)
  await sendErrorEmail("Concept extraction failed for " + videoId, error);

  // Throw to caller (syncVideoToCourses)
  throw error;
}
```

Email alert recipient: `ravenshroud@gmail.com` (configured via Brevo SMTP)

---

## Files

| File | Purpose |
|------|---------|
| `functions/lib/concept-extractor.js` | Concept extraction logic |
| `functions/test/test-concept-extractor.js` | Unit tests |
| `docs/testing/concept-extractor-guide.md` | This guide |
