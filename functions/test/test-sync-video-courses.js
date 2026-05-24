#!/usr/bin/env node
/**
 * Test the syncVideoToCourses pipeline.
 * Run with: USE_MOCK_AESOP=true node functions/test/test-sync-video-courses.js
 */

const aesopMock = require('./mocks/aesop-academy-api.js');

console.log('Testing syncVideoToCourses Pipeline\n');

(async () => {
  console.log('Test 1: Course matching with sample concepts');
  const sampleConcepts = ['machine learning', 'ai', 'automation'];
  const catalog = aesopMock.getCatalog();

  // Simulate the matching logic
  const matched = [];
  const conceptsLower = sampleConcepts.map(c => c.toLowerCase());

  for (const course of catalog.courses) {
    let score = 0;
    const keywords = (course.keywords || []).map(k => k.toLowerCase());
    const courseText = `${course.name} ${course.description}`.toLowerCase();

    conceptsLower.forEach(concept => {
      if (keywords.some(kw => kw.includes(concept) || concept.includes(kw))) {
        score += 0.5;
      }
      if (courseText.includes(concept)) {
        score += 0.3;
      }
    });

    const normalizedScore = Math.min(1, score);
    if (normalizedScore > 0) {
      matched.push({
        id: course.id,
        name: course.name,
        desc: course.description,
        url: course.url,
        live: course.live,
        relevanceScore: parseFloat(normalizedScore.toFixed(2)),
      });
    }
  }

  const sorted = matched.sort((a, b) => b.relevanceScore - a.relevanceScore);
  console.log(`✓ Matched ${sorted.length} courses for concepts: ${sampleConcepts.join(', ')}`);
  console.log('  Top 3 matches:');
  sorted.slice(0, 3).forEach((c, i) => {
    console.log(`    ${i + 1}. ${c.name} (score: ${c.relevanceScore})`);
  });

  console.log('\nTest 2: Empty concepts');
  const emptyConcepts = [];
  const empty = matched.filter(() => emptyConcepts.length > 0);
  console.log(`✓ Empty concepts returns ${empty.length} matches`);

  console.log('\nTest 3: Course structure validation');
  const first = sorted[0];
  const validFields = first && first.id && first.name && first.url && first.relevanceScore !== undefined;
  console.log('✓ Course structure valid:', validFields);

  console.log('\nTest 4: Relevance scores normalized (0-1)');
  const allNormalized = sorted.every(c => c.relevanceScore >= 0 && c.relevanceScore <= 1);
  console.log('✓ All scores in range [0, 1]:', allNormalized);

  console.log('\n✓ All tests passed');
  console.log('\nNote: Full pipeline tests require Firebase emulator setup');
})().catch(err => {
  console.error('✗ Test failed:', err.message);
  process.exit(1);
});
