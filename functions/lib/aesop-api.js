/**
 * Aesop Academy API Integration
 *
 * Handles fetching the course catalog from the real Aesop Academy API.
 * Implements hash-based caching to avoid redundant requests.
 *
 * Usage:
 *   const aesopApi = require('./lib/aesop-api.js');
 *   const catalog = await aesopApi.getCatalog(db);
 */

const crypto = require("crypto");

const CACHE_DOC = "aesop-catalog-cache";
const CACHE_COLLECTION = "_cache";
const CACHE_TTL_HOURS = 24;
const API_ENDPOINT = "https://aesopacademy.org/aesop-api/catalog.php";
const FALLBACK_CATALOG = {
  courses: [
    {
      id: "ai-and-creativity",
      name: "AI & Creativity",
      description: "Explore how artificial intelligence augments creative processes in design, writing, music production, and visual arts.",
      url: "https://aesopacademy.org/courses/ai-and-creativity/",
      live: true,
      keywords: ["ai", "creativity", "design", "art", "generative"],
    },
    {
      id: "ai-fundamentals",
      name: "AI Fundamentals",
      description: "Master the core concepts of artificial intelligence, machine learning, neural networks, and large language models.",
      url: "https://aesopacademy.org/courses/ai-fundamentals/",
      live: true,
      keywords: ["ai", "machine learning", "neural networks", "llm", "fundamentals"],
    },
    {
      id: "prompt-engineering",
      name: "Prompt Engineering",
      description: "Learn to craft effective prompts that unlock the full potential of large language models like ChatGPT and Claude.",
      url: "https://aesopacademy.org/courses/prompt-engineering/",
      live: true,
      keywords: ["prompting", "prompt engineering", "chatgpt", "claude", "gpt", "llm"],
    },
    {
      id: "business-strategy-ai",
      name: "Business Strategy with AI",
      description: "Develop strategic approaches to integrating AI into business operations, from automation to decision-making.",
      url: "https://aesopacademy.org/courses/business-strategy-ai/",
      live: true,
      keywords: ["business", "strategy", "ai", "automation", "operations"],
    },
    {
      id: "python-for-ai",
      name: "Python for AI Development",
      description: "Build AI applications using Python, TensorFlow, PyTorch, and popular ML libraries.",
      url: "https://aesopacademy.org/courses/python-for-ai/",
      live: false,
      keywords: ["python", "programming", "tensorflow", "pytorch", "ml"],
    },
    {
      id: "data-analysis",
      name: "Data Analysis & Visualization",
      description: "Transform raw data into actionable insights using analytics tools and visualization techniques.",
      url: "https://aesopacademy.org/courses/data-analysis/",
      live: true,
      keywords: ["data", "analysis", "visualization", "analytics"],
    },
    {
      id: "marketing-ai",
      name: "Marketing with AI",
      description: "Leverage AI-powered tools for audience insights, content creation, and campaign optimization.",
      url: "https://aesopacademy.org/courses/marketing-ai/",
      live: true,
      keywords: ["marketing", "ai", "content", "growth", "copywriting"],
    },
    {
      id: "ethical-ai",
      name: "Ethical AI & Responsible Innovation",
      description: "Explore the ethical implications, biases, and best practices for responsible AI deployment.",
      url: "https://aesopacademy.org/courses/ethical-ai/",
      live: true,
      keywords: ["ethics", "responsible", "bias", "governance"],
    },
  ],
};

function hashCatalog(catalog) {
  const json = JSON.stringify(catalog);
  return crypto.createHash("sha256").update(json).digest("hex");
}

async function getCatalogFromAPI() {
  console.log("getCatalogFromAPI: fetching from", API_ENDPOINT);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(API_ENDPOINT, {
      signal: controller.signal,
      headers: {
        "User-Agent": "25experts/1.0",
        "Accept": "application/json",
      },
    });

    console.log("getCatalogFromAPI: received response with status", response.status);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const catalog = await response.json();

    if (!catalog.courses || !Array.isArray(catalog.courses)) {
      throw new Error("Invalid catalog format: missing courses array");
    }

    console.log("getCatalogFromAPI: successfully fetched catalog with", catalog.courses.length, "courses");
    return catalog;
  } finally {
    clearTimeout(timeout);
  }
}

async function getCatalog(db, forceRefresh = false) {
  console.log("getCatalog: starting, forceRefresh =", forceRefresh);

  if (!db) {
    throw new Error("Firestore instance required");
  }

  const cacheDoc = db.collection(CACHE_COLLECTION).doc(CACHE_DOC);

  if (!forceRefresh) {
    try {
      console.log("getCatalog: checking cache...");
      const snapshot = await cacheDoc.get();
      if (snapshot.exists) {
        const cached = snapshot.data();
        const cachedAt = cached.cachedAt instanceof Object && typeof cached.cachedAt.toMillis === 'function'
          ? cached.cachedAt.toMillis()
          : cached.cachedAt || 0;
        const cacheAge = Date.now() - cachedAt;
        const isExpired = cacheAge > CACHE_TTL_HOURS * 60 * 60 * 1000;

        console.log("getCatalog: cache age =", cacheAge, "ms, expired =", isExpired);

        if (!isExpired) {
          console.log("getCatalog: returning cached catalog with", cached.catalog.courses.length, "courses");
          return cached.catalog;
        }
      } else {
        console.log("getCatalog: no cache found");
      }
    } catch (err) {
      console.warn("Cache read failed, fetching fresh:", err.message);
    }
  }

  // Fetch fresh catalog
  let catalog;
  try {
    console.log("getCatalog: fetching fresh catalog from API...");
    catalog = await getCatalogFromAPI();
  } catch (error) {
    console.error("Failed to fetch Aesop Academy API:", error.message);

    // Fallback to stale cache if available
    try {
      console.log("getCatalog: trying stale cache fallback...");
      const snapshot = await cacheDoc.get();
      if (snapshot.exists && snapshot.data().catalog) {
        console.warn("Using stale cache due to API failure");
        return snapshot.data().catalog;
      }
    } catch (cacheErr) {
      console.error("Cache fallback also failed:", cacheErr.message);
    }

    throw new Error(`Aesop Academy API unavailable: ${error.message}`);
  }

  // Cache the fresh catalog
  try {
    console.log("getCatalog: caching fresh catalog with", catalog.courses.length, "courses...");
    const hash = hashCatalog(catalog);
    await cacheDoc.set({
      catalog,
      hash,
      cachedAt: Date.now(),
    });
    console.log("getCatalog: cache write successful");
  } catch (err) {
    console.warn("Cache write failed:", err.message);
    // Non-fatal; still return the catalog
  }

  return catalog;
}

async function getCourseCatalog(db, useMock = false) {
  if (useMock || process.env.USE_MOCK_AESOP === "true") {
    const aesopMock = require("../test/mocks/aesop-academy-api.js");
    return aesopMock.getCatalog();
  }

  try {
    return await getCatalog(db);
  } catch (error) {
    console.warn("Using fallback course catalog due to API/cache failure:", error.message);
    return FALLBACK_CATALOG;
  }
}

module.exports = {
  getCatalog,
  getCourseCatalog,
  getCatalogFromAPI,
  hashCatalog,
};
