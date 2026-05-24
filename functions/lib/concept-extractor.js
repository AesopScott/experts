/**
 * Concept Extractor — Extracts learning concepts from video transcripts.
 *
 * Phase 1 (placeholder): Returns stub data
 * Phase 2: Integrates with OpenAI to analyze transcripts and extract concepts
 *
 * Usage:
 *   const extractor = require('./lib/concept-extractor.js');
 *   const concepts = await extractor.extractConcepts(transcript, openaiKey);
 */

async function extractConcepts(transcript, openaiKey) {
  if (!transcript || transcript.trim().length === 0) {
    return [];
  }

  // Phase 1: Placeholder implementation
  // Returns stub concepts for testing UI and integration
  // Will be replaced with OpenAI call in Phase 2

  return [
    "machine learning",
    "artificial intelligence",
    "tutorial",
    "technical education",
  ];
}

async function extractConceptsWithOpenAI(transcript, client, model = "gpt-4o-mini") {
  if (!transcript || transcript.trim().length === 0) {
    return [];
  }

  if (!client || !model) {
    throw new Error("OpenAI client and model are required");
  }

  const systemPrompt = `You are an expert instructional designer analyzing video transcripts.
Extract 5-10 key learning concepts from the transcript. These should be:
- Specific, actionable topics (not generic like "introduction" or "conclusion")
- Topics that Aesop Academy courses might cover
- Sorted by importance/frequency in the transcript

Return as a JSON array of strings.`;

  const userPrompt = `Transcript:\n\n${transcript.slice(0, 4000)}\n\nExtract key learning concepts as a JSON array.`;

  try {
    const message = await client.messages.create({
      model,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const content = message.content[0]?.text || "";
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const concepts = JSON.parse(match[0]);
    return Array.isArray(concepts)
      ? concepts.filter(c => typeof c === "string" && c.length > 0)
      : [];
  } catch (error) {
    console.error("OpenAI concept extraction failed:", error.message);
    throw error;
  }
}

module.exports = {
  extractConcepts,
  extractConceptsWithOpenAI,
};
