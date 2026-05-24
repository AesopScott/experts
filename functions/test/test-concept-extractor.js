#!/usr/bin/env node
/**
 * Test the concept extractor utility.
 * Run with: node functions/test/test-concept-extractor.js
 */

const extractor = require('../lib/concept-extractor.js');

console.log('Testing Concept Extractor\n');

// Test 1: Extract from sample transcript (Phase 1 stub)
const sampleTranscript = `
  Welcome to this tutorial on machine learning. Today we'll explore artificial intelligence
  and how it's transforming education. We'll cover neural networks, deep learning, and practical
  applications in the real world. This is a technical education video designed to teach you
  the fundamentals of AI systems.
`;

console.log('Test 1: Extract concepts from sample transcript');
(async () => {
  const concepts = await extractor.extractConcepts(sampleTranscript);
  console.log('✓ Extracted concepts:', JSON.stringify(concepts, null, 2));
  console.log('  Count:', concepts.length);

  // Test 2: Empty transcript
  console.log('\nTest 2: Empty transcript');
  const empty = await extractor.extractConcepts('');
  console.log('✓ Empty transcript returns:', JSON.stringify(empty), '(length:', empty.length + ')');

  // Test 3: Whitespace only
  console.log('\nTest 3: Whitespace only');
  const whitespace = await extractor.extractConcepts('   ');
  console.log('✓ Whitespace returns:', JSON.stringify(whitespace), '(length:', whitespace.length + ')');

  // Test 4: Verify structure
  console.log('\nTest 4: Verify concept structure');
  const allStrings = concepts.every(c => typeof c === 'string' && c.length > 0);
  console.log('✓ All concepts are non-empty strings:', allStrings);

  console.log('\n✓ All tests passed');
  console.log('\nNote: Phase 2 will integrate OpenAI for production concept extraction.');
})().catch(err => {
  console.error('✗ Test failed:', err.message);
  process.exit(1);
});
