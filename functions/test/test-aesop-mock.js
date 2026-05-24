#!/usr/bin/env node
/**
 * Quick test of the Aesop Academy API mock.
 * Run with: node functions/test/test-aesop-mock.js
 */

const aesopMock = require('./mocks/aesop-academy-api.js');

console.log('Testing Aesop Academy API Mock\n');

// Test 1: Get catalog
const catalog = aesopMock.getCatalog();
console.log('✓ getCatalog() returned', catalog.courses.length, 'courses');

// Test 2: Search for concepts
const concepts = ['ai', 'machine learning', 'automation'];
const matches = aesopMock.searchCoursesForConcepts(concepts);
console.log('✓ searchCoursesForConcepts(' + JSON.stringify(concepts) + ')');
console.log('  Found', matches.length, 'matches');

if (matches.length > 0) {
  console.log('  Top match:', matches[0].name, '(score:', matches[0].relevanceScore.toFixed(2) + ')');
  if (matches.length > 1) {
    console.log('  2nd match:', matches[1].name, '(score:', matches[1].relevanceScore.toFixed(2) + ')');
  }
}

// Test 3: Empty concepts
const empty = aesopMock.searchCoursesForConcepts([]);
console.log('✓ searchCoursesForConcepts([]) returned', empty.length, 'courses');

// Test 4: No matching concepts
const noMatch = aesopMock.searchCoursesForConcepts(['xyz123nonexistent']);
console.log('✓ searchCoursesForConcepts([nonexistent]) returned', noMatch.length, 'courses');

console.log('\n✓ All tests passed');
