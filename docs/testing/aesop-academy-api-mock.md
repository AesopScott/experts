# Aesop Academy API Mock — Local Testing Guide

## Overview

The Aesop Academy API mock provides a simulated course catalog for development and testing of the `syncVideoToCourses` function without requiring network access to the live API.

---

## Location

`functions/test/mocks/aesop-academy-api.js`

---

## Usage

### In Tests

```javascript
const aesopMock = require('../test/mocks/aesop-academy-api.js');

// Get full catalog
const catalog = aesopMock.getCatalog();

// Search for courses by learning concepts
const concepts = ["machine learning", "automation", "ai"];
const matches = aesopMock.searchCoursesForConcepts(concepts);
// Returns: Array of courses sorted by relevanceScore (0-1)
```

### In syncVideoToCourses (Production)

When the real `syncVideoToCourses` function is implemented, it will:
1. Call the real Aesop Academy API at `https://aesopacademy.org/aesop-api/catalog.php`
2. Extract learning concepts from the video transcript using OpenAI
3. Match concepts to courses and score by relevance

For **local testing**, the function can be temporarily modified to use the mock:

```javascript
async function getCourseMatches(concepts) {
  if (process.env.USE_MOCK_AESOP === "true") {
    const aesopMock = require('../test/mocks/aesop-academy-api.js');
    return aesopMock.searchCoursesForConcepts(concepts);
  }
  // Real API call (production)
  const response = await fetch("https://aesopacademy.org/aesop-api/catalog.php");
  // ... process response
}
```

---

## Mock Catalog Contents

The mock includes 8 sample courses:

| Course ID | Name | Status | Keywords |
|-----------|------|--------|----------|
| `ai-and-creativity` | AI & Creativity | Live | ai, creativity, design, generative, dalle, midjourney |
| `ai-fundamentals` | AI Fundamentals | Live | ai, machine learning, neural networks, llm |
| `prompt-engineering` | Prompt Engineering | Live | prompting, chatgpt, claude, llm |
| `business-strategy-ai` | Business Strategy with AI | Live | business, strategy, ai, automation |
| `python-for-ai` | Python for AI Development | Coming Soon | python, tensorflow, pytorch |
| `data-analysis` | Data Analysis & Visualization | Live | data, analysis, visualization, analytics |
| `marketing-ai` | Marketing with AI | Live | marketing, ai, content, social media |
| `ethical-ai` | Ethical AI & Responsible Innovation | Live | ethics, responsible, bias, fairness |

---

## Relevance Scoring Algorithm

The mock implements semantic matching:

1. **Keyword match** (+0.5 points): Learning concept matches a course keyword
2. **Text match** (+0.3 points): Learning concept appears in course name/description
3. **Score cap**: Maximum 1.0 per course (normalized)
4. **Filter**: Only courses with score > 0 are returned
5. **Sort**: Descending by relevance score

Example:
```javascript
// For concepts: ["machine learning", "ai"]
searchCoursesForConcepts(["machine learning", "ai"])
// Returns:
// [
//   { id: "ai-fundamentals", relevanceScore: 0.8, ... },
//   { id: "ai-and-creativity", relevanceScore: 0.5, ... },
//   ...
// ]
```

---

## Real API Integration (Future)

When integrating with the real Aesop Academy API:

1. **Endpoint:** `GET https://aesopacademy.org/aesop-api/catalog.php`
2. **Response format:** JSON with courses array matching mock structure
3. **Error handling:** Retry logic + email alert on failure
4. **Caching:** Hash-based cache to avoid redundant calls

The mock structure ensures testing can begin immediately while production integration continues in parallel.

---

## Testing Proof Units

| Unit | Command | Success Criteria |
|------|---------|-----------------|
| **Mock import** | `node -e "require('./functions/test/mocks/aesop-academy-api.js')"` | No errors |
| **Catalog retrieval** | Unit test: `getCatalog().courses.length === 8` | Exactly 8 courses |
| **Concept search** | Unit test: `searchCoursesForConcepts(["ai"]).length > 0` | Returns matches |
| **Relevance scoring** | Unit test: Matches are sorted descending by score | Highest score first |
| **Empty concepts** | Unit test: `searchCoursesForConcepts([]).length === 0` | Returns empty array |
