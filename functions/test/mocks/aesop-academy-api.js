/**
 * Mock Aesop Academy API for local testing.
 * Simulates the catalog.php endpoint used by syncVideoToCourses.
 *
 * Usage:
 *   const aesopMock = require('./mocks/aesop-academy-api.js');
 *   const catalog = aesopMock.getCatalog();
 */

function getCatalog() {
  return {
    courses: [
      {
        id: "ai-and-creativity",
        name: "AI & Creativity",
        description: "Explore how artificial intelligence augments creative processes in design, writing, music production, and visual arts.",
        url: "https://aesopacademy.org/courses/ai-and-creativity/",
        live: true,
        keywords: ["ai", "creativity", "design", "art", "generative", "dall-e", "midjourney"],
      },
      {
        id: "ai-fundamentals",
        name: "AI Fundamentals",
        description: "Master the core concepts of artificial intelligence, machine learning, neural networks, and large language models.",
        url: "https://aesopacademy.org/courses/ai-fundamentals/",
        live: true,
        keywords: ["ai", "machine learning", "neural networks", "llm", "fundamentals", "basics", "concepts"],
      },
      {
        id: "prompt-engineering",
        name: "Prompt Engineering",
        description: "Learn to craft effective prompts that unlock the full potential of large language models like ChatGPT and Claude.",
        url: "https://aesopacademy.org/courses/prompt-engineering/",
        live: true,
        keywords: ["prompting", "prompt engineering", "chatgpt", "claude", "gpt", "llm", "optimization"],
      },
      {
        id: "business-strategy-ai",
        name: "Business Strategy with AI",
        description: "Develop strategic approaches to integrating AI into business operations, from automation to decision-making.",
        url: "https://aesopacademy.org/courses/business-strategy-ai/",
        live: true,
        keywords: ["business", "strategy", "ai", "automation", "operations", "management", "corporate"],
      },
      {
        id: "python-for-ai",
        name: "Python for AI Development",
        description: "Build AI applications using Python, TensorFlow, PyTorch, and popular ML libraries.",
        url: "https://aesopacademy.org/courses/python-for-ai/",
        live: false,
        keywords: ["python", "programming", "tensorflow", "pytorch", "ml", "development", "coding"],
      },
      {
        id: "data-analysis",
        name: "Data Analysis & Visualization",
        description: "Transform raw data into actionable insights using analytics tools and visualization techniques.",
        url: "https://aesopacademy.org/courses/data-analysis/",
        live: true,
        keywords: ["data", "analysis", "visualization", "analytics", "insights", "dashboards"],
      },
      {
        id: "marketing-ai",
        name: "Marketing with AI",
        description: "Leverage AI-powered tools for audience insights, content creation, and campaign optimization.",
        url: "https://aesopacademy.org/courses/marketing-ai/",
        live: true,
        keywords: ["marketing", "ai", "content", "social media", "growth", "audience", "copywriting"],
      },
      {
        id: "ethical-ai",
        name: "Ethical AI & Responsible Innovation",
        description: "Explore the ethical implications, biases, and best practices for responsible AI deployment.",
        url: "https://aesopacademy.org/courses/ethical-ai/",
        live: true,
        keywords: ["ethics", "responsible", "bias", "fairness", "governance", "compliance"],
      },
    ],
  };
}

function searchCoursesForConcepts(concepts) {
  if (!Array.isArray(concepts) || concepts.length === 0) {
    return [];
  }

  const catalog = getCatalog();
  const conceptsLower = concepts.map(c => c.toLowerCase());

  const scored = catalog.courses.map(course => {
    let score = 0;
    const courseKeywords = course.keywords.map(k => k.toLowerCase());
    const courseText = (course.name + " " + course.description).toLowerCase();

    // Match on keywords
    conceptsLower.forEach(concept => {
      if (courseKeywords.some(kw => kw.includes(concept) || concept.includes(kw))) {
        score += 0.5;
      }
      if (courseText.includes(concept)) {
        score += 0.3;
      }
    });

    return { course, score: Math.min(1, score) };
  });

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => ({ ...item.course, relevanceScore: item.score }));
}

module.exports = {
  getCatalog,
  searchCoursesForConcepts,
};
