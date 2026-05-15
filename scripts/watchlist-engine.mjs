import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";

const DEFAULT_V2_ROOT = "C:/Users/scott/Code/Aesop/ai-academy/modules/v2";
const DEFAULT_EMBEDDING_MODEL_PATH = "C:/Users/scott/Code/Aesop/models/embeddings/all-MiniLM-L6-v2";
const DEFAULT_OBSIDIAN_PATH = "G:/My Drive/Aesop Academy/Obsidian/diamond_Build/7-Integrations.md";
const DEFAULT_PINECONE_HOST = "https://aesop-academy-sqe0vz2.svc.aped-4627-b74a.pinecone.io";
const DEFAULT_PINECONE_INDEX = "aesop-academy";
const LOCAL_EMBEDDING_DIMENSION = 384;
const START = "<!-- watchlist-engine:start -->";
const END = "<!-- watchlist-engine:end -->";

const COURSE_TITLES = {
  "ai-ethics-decision-making": "AI Ethics & Decision Making",
  "building-with-ai": "Building with AI",
  "building-ai-agents-use-cases": "Building AI Agents: Use Cases"
};

const COURSE_ID_ALIASES = {
  "ai-ethics-decision-making": ["ai-ethics-decision-making-v2"],
  "building-with-ai": ["building-with-ai-v2"],
  "building-ai-agents-use-cases": [
    "building-ai-agents-use-cases-v2",
    "building-ai-agents-v2"
  ]
};

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : "true"];
  })
);

const v2Root = args.get("v2-root") || DEFAULT_V2_ROOT;
const embeddingModelPath = args.get("embedding-model") || DEFAULT_EMBEDDING_MODEL_PATH;
const obsidianPath = args.get("obsidian") || DEFAULT_OBSIDIAN_PATH;
const videosPerCourse = Number(args.get("videos-per-course") || 2);
const topK = Number(args.get("pinecone-top-k") || 8);
const dryRun = args.get("dry-run") === "true";
const auditOnly = args.get("audit-only") === "true";
const indexV2 = args.get("index-v2") === "true";

const pineconeApiKey = process.env.PINECONE_API_KEY || "";
const pineconeHost = process.env.PINECONE_HOST || DEFAULT_PINECONE_HOST;
const pineconeIndex = process.env.PINECONE_INDEX || DEFAULT_PINECONE_INDEX;
const pineconeNamespace = process.env.PINECONE_NAMESPACE || "";
let localExtractor;
const embeddingModelBasePath = embeddingModelPath.replace(/[\\/][^\\/]+[\\/]?$/, "/");
const embeddingModelName = embeddingModelPath.replace(/[\\/]$/, "").split(/[\\/]/).pop();

function requireEnv() {
  const missing = [];
  if (!pineconeApiKey) missing.push("PINECONE_API_KEY");

  if (missing.length) {
    throw new Error(
      [
        `Missing required environment variable(s): ${missing.join(", ")}`,
        "",
        "The Watchlist engine now requires Pinecone as the course source of truth.",
        "Set these before running:",
        "  $env:PINECONE_API_KEY='...'",
        "  $env:PINECONE_HOST='<384-dimension Pinecone index host>'",
        `  $env:PINECONE_INDEX='${pineconeIndex}'`,
        "",
        "No YouTube selections were generated because V2 course presence in Pinecone could not be verified."
      ].join("\n")
    );
  }
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : undefined;
    const request = https.request(
      url,
      {
        method: options.method || "GET",
        headers: {
          "content-type": "application/json",
          ...(body ? { "content-length": Buffer.byteLength(body) } : {}),
          ...(options.headers || {})
        }
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`${response.statusCode} ${response.statusMessage}: ${text.slice(0, 500)}`));
            return;
          }
          try {
            resolve(text ? JSON.parse(text) : {});
          } catch (error) {
            reject(new Error(`Invalid JSON from ${url}: ${error.message}`));
          }
        });
      }
    );
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

function requestText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "accept-language": "en-US,en;q=0.9",
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36"
          }
        },
        (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () => resolve(body));
        }
      )
      .on("error", reject);
  });
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitles(html) {
  const titles = [];
  const regex = /<h1[^>]*class=["'][^"']*read-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    titles.push(stripHtml(match[1]));
  }
  return titles.filter(Boolean);
}

function extractCourseIds(html) {
  return [...html.matchAll(/(?:var|const)\s+COURSE_ID\s*=\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

async function readV2Courses() {
  const entries = await fs.readdir(v2Root, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory());
  const courses = [];

  for (const dir of dirs) {
    const coursePath = path.join(v2Root, dir.name);
    const files = (await fs.readdir(coursePath))
      .filter((file) => /^m\d+\.html$/.test(file))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    const modules = [];
    const ids = new Set(COURSE_ID_ALIASES[dir.name] || []);

    for (const file of files) {
      const html = await fs.readFile(path.join(coursePath, file), "utf8");
      for (const id of extractCourseIds(html)) ids.add(id);
      modules.push({
        id: file.replace(".html", ""),
        titles: extractTitles(html),
        text: stripHtml(html).slice(0, 6000)
      });
    }

    courses.push({
      slug: dir.name,
      title: COURSE_TITLES[dir.name] || dir.name,
      aliases: [...ids],
      modules,
      sourcePath: coursePath
    });
  }

  return courses;
}

async function embed(text) {
  if (!localExtractor) {
    const { env, pipeline } = await import("@xenova/transformers");
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = embeddingModelBasePath;
    localExtractor = await pipeline("feature-extraction", embeddingModelName, {
      quantized: true
    });
  }

  const output = await localExtractor(text, {
    pooling: "mean",
    normalize: true
  });
  return Array.from(output.data);
}

async function pineconeStats() {
  return requestJson(`${pineconeHost.replace(/\/$/, "")}/describe_index_stats`, {
    method: "POST",
    headers: { "Api-Key": pineconeApiKey },
    body: {}
  });
}

async function assertPineconeDimension() {
  const stats = await pineconeStats();
  const dimension = Number(stats.dimension || 0);
  if (dimension && dimension !== LOCAL_EMBEDDING_DIMENSION) {
    throw new Error(
      [
        `Pinecone index dimension mismatch: host reports ${dimension}, local model emits ${LOCAL_EMBEDDING_DIMENSION}.`,
        "",
        `Current host: ${pineconeHost}`,
        `Local model: ${embeddingModelPath}`,
        "",
        "Use or create a Pinecone index with dimension 384 for the local embedding model.",
        "Do not upsert these vectors into the existing 1024-dimension index."
      ].join("\n")
    );
  }
  return stats;
}

async function queryPinecone(vector, namespace) {
  const body = {
    vector,
    topK,
    includeMetadata: true
  };
  if (namespace) body.namespace = namespace;

  return requestJson(`${pineconeHost.replace(/\/$/, "")}/query`, {
    method: "POST",
    headers: { "Api-Key": pineconeApiKey },
    body
  });
}

async function upsertPinecone(vectors, namespace) {
  const body = { vectors };
  if (namespace) body.namespace = namespace;

  return requestJson(`${pineconeHost.replace(/\/$/, "")}/vectors/upsert`, {
    method: "POST",
    headers: { "Api-Key": pineconeApiKey },
    body
  });
}

function metadataText(match) {
  const metadata = match.metadata || {};
  return Object.entries(metadata)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" ");
}

function normalized(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeCourseMatch(course, match) {
  const haystack = normalized(`${match.id || ""} ${metadataText(match)}`);
  const titleWords = normalized(course.title).split(" ").filter((word) => word.length > 2);
  return (
    haystack.includes(normalized(course.slug)) ||
    course.aliases.some((alias) => haystack.includes(normalized(alias))) ||
    titleWords.every((word) => haystack.includes(word))
  );
}

async function indexCoursesInPinecone(courses) {
  let total = 0;
  for (const course of courses) {
    const vectors = [];
    for (const module of course.modules) {
      const text = [course.title, ...module.titles, module.text].join("\n").slice(0, 12000);
      const vector = await embed(text);
      vectors.push({
        id: `v2:${course.aliases[0] || course.slug}:${module.id}`,
        values: vector,
        metadata: {
          source: "aesop-v2-course",
          courseId: course.aliases[0] || course.slug,
          courseAliases: course.aliases.join(", "),
          courseSlug: course.slug,
          courseTitle: course.title,
          moduleId: module.id,
          moduleTitle: module.titles[0] || module.id,
          moduleTitles: module.titles.join(" | "),
          sourcePath: `${course.sourcePath}/${module.id}.html`,
          textPreview: module.text.slice(0, 900)
        }
      });
    }
    const result = await upsertPinecone(vectors, pineconeNamespace);
    total += Number(result.upsertedCount || vectors.length);
    console.log(`Indexed ${vectors.length} chunks for ${course.title}`);
  }
  return total;
}

async function verifyCoursesInPinecone(courses) {
  const stats = await assertPineconeDimension();
  const namespaces = pineconeNamespace
    ? [pineconeNamespace]
    : Object.keys(stats.namespaces || {});
  const queryNamespaces = namespaces.length ? namespaces : [""];

  const verified = [];
  for (const course of courses) {
    const moduleTitles = course.modules.flatMap((module) => module.titles).slice(0, 10).join("; ");
    const vector = await embed(`${course.title}. ${moduleTitles}`);
    const allMatches = [];

    for (const namespace of queryNamespaces) {
      const result = await queryPinecone(vector, namespace);
      const matches = (result.matches || []).map((match) => ({ ...match, namespace }));
      allMatches.push(...matches);
    }

    const directMatches = allMatches.filter((match) => looksLikeCourseMatch(course, match));
    verified.push({
      ...course,
      pineconeMatches: directMatches.length ? directMatches : allMatches.slice(0, 3),
      verifiedInPinecone: directMatches.length > 0
    });
  }

  const missing = verified.filter((course) => !course.verifiedInPinecone);
  if (missing.length) {
    const details = missing
      .map((course) => `- ${course.title} (${course.aliases.join(", ") || course.slug})`)
      .join("\n");
    throw new Error(
      [
        "V2 course presence could not be verified in Pinecone.",
        details,
        "",
        `Index: ${pineconeIndex}`,
        `Host: ${pineconeHost}`,
        `Namespaces checked: ${queryNamespaces.map((item) => item || "(default)").join(", ")}`,
        "",
        "Stopping before YouTube selection. Index the V2 course chunks first, then rerun this engine."
      ].join("\n")
    );
  }

  return verified;
}

function extractJsonObjects(html, key) {
  const out = [];
  const needle = `"${key}":`;
  let pos = 0;

  while ((pos = html.indexOf(needle, pos)) !== -1) {
    const start = html.indexOf("{", pos + needle.length);
    if (start === -1) break;

    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;

    for (let i = start; i < html.length; i += 1) {
      const char = html[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === "\"") inString = false;
      } else if (char === "\"") {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    if (end === -1) break;
    try {
      out.push(JSON.parse(html.slice(start, end)));
    } catch {
      // YouTube emits renderer variants that are not always clean JSON once extracted.
    }
    pos = end;
  }

  return out;
}

function words(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3)
  );
}

function pineconeEvidence(course) {
  return course.pineconeMatches.map((match) => metadataText(match)).join(" ");
}

function searchQueries(course) {
  const moduleTitles = course.modules.flatMap((module) => module.titles).slice(0, 5);
  const evidence = pineconeEvidence(course)
    .split(/\s+/)
    .filter((word) => /^[a-zA-Z][a-zA-Z-]{4,}$/.test(word))
    .slice(0, 16)
    .join(" ");
  return [
    `${course.title} AI tutorial`,
    `${moduleTitles[0] || course.title} AI explained`,
    `${moduleTitles[1] || course.title} AI tutorial`,
    `${course.title} ${evidence} YouTube`
  ].filter(Boolean);
}

function scoreVideo(course, video) {
  const courseWords = words(`${course.title} ${pineconeEvidence(course)} ${course.modules.flatMap((m) => m.titles).join(" ")}`);
  const videoWords = words(`${video.title} ${video.channel}`);
  let overlap = 0;
  for (const word of videoWords) {
    if (courseWords.has(word)) overlap += 1;
  }
  const titleBonus = /explained|tutorial|guide|course|learn|beginner|deep dive|how to/i.test(video.title) ? 3 : 0;
  return overlap + titleBonus;
}

async function searchYouTube(course) {
  const unique = new Map();

  for (const query of searchQueries(course)) {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const html = await requestText(url);
    const videos = extractJsonObjects(html, "videoRenderer")
      .map((item) => ({
        id: item.videoId,
        title: item.title?.runs?.[0]?.text || item.title?.simpleText || "",
        channel: item.ownerText?.runs?.[0]?.text || item.longBylineText?.runs?.[0]?.text || "",
        duration: item.lengthText?.simpleText || "",
        url: item.videoId ? `https://www.youtube.com/watch?v=${item.videoId}` : "",
        sourceQuery: query
      }))
      .filter((video) => video.id && video.title && !/shorts/i.test(video.url));

    for (const video of videos) {
      if (!unique.has(video.id)) unique.set(video.id, video);
    }

    if (unique.size >= videosPerCourse * 5) break;
  }

  return [...unique.values()]
    .map((video) => ({ ...video, score: scoreVideo(course, video) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, videosPerCourse);
}

function renderMarkdown(courses, results) {
  const now = new Date().toISOString();
  const lines = [
    START,
    `Generated: ${now}`,
    "",
    "Purpose: curate public AI creator videos that match the V2 Aesop course content already present in Pinecone, then route viewers back to the original creator video and the related structured course.",
    "",
    "Engine status:",
    `- V2 course source: \`${v2Root}\``,
    `- Local embedding model: \`${embeddingModelPath}\``,
    `- Embedding dimension: \`${LOCAL_EMBEDDING_DIMENSION}\``,
    `- Pinecone index: \`${pineconeIndex}\``,
    `- Pinecone host: \`${pineconeHost}\``,
    `- Pinecone namespace(s): \`${pineconeNamespace || "all namespaces reported by stats"}\``,
    "- Matching rule: V2 course must verify in Pinecone before YouTube selection runs",
    "- Optional indexing rule: run `--index-v2` to upsert the local V2 course chunks into Pinecone first",
    "- Publishing rule: human approval before anything goes live on 25experts",
    "",
    "### Pinecone V2 Verification",
    ""
  ];

  for (const course of courses) {
    lines.push(`- ${course.title}: verified in Pinecone`);
    for (const match of course.pineconeMatches.slice(0, 2)) {
      const title = match.metadata?.title || match.metadata?.source || match.id || "Pinecone match";
      lines.push(`  - Evidence: ${title} (score ${Number(match.score || 0).toFixed(3)}, namespace ${match.namespace || "default"})`);
    }
  }

  lines.push("", "### Watchlist Items", "");

  for (const item of results) {
    lines.push(`#### ${item.course.title}`);
    lines.push(`Course IDs checked: ${item.course.aliases.join(", ")}`);
    lines.push("");
    for (const video of item.videos) {
      lines.push(`- [${video.title}](${video.url})`);
      lines.push(`  - Creator/channel: ${video.channel || "Unknown"}`);
      lines.push(`  - Duration: ${video.duration || "Unknown"}`);
      lines.push(`  - Pinecone-derived query: \`${video.sourceQuery}\``);
      lines.push(`  - Relevance score: ${video.score}`);
      lines.push("  - Watchlist angle: celebrate the creator's explanation, link directly to YouTube, and point learners to the related Aesop course for structured practice.");
    }
    lines.push("");
  }

  lines.push(END);
  return lines.join("\n");
}

function upsertSection(note, block) {
  const heading = "## Watchlist Items";
  const section = `${heading}\n${block}`;

  if (note.includes(START) && note.includes(END)) {
    const pattern = new RegExp(`${START}[\\s\\S]*?${END}`);
    return note.replace(pattern, block);
  }

  if (note.includes(heading)) {
    return note.replace(heading, section);
  }

  return `${note.trimEnd()}\n\n${section}\n`;
}

async function main() {
  requireEnv();
  const courses = await readV2Courses();
  console.log(`Found ${courses.length} V2 courses in ${v2Root}`);

  if (indexV2) {
    const count = await indexCoursesInPinecone(courses);
    console.log(`Upserted ${count} V2 chunks into Pinecone`);
  }

  const verifiedCourses = await verifyCoursesInPinecone(courses);
  console.log(`Verified ${verifiedCourses.length} V2 courses in Pinecone`);

  if (auditOnly) {
    for (const course of verifiedCourses) {
      console.log(`${course.title}: ${course.pineconeMatches.length} Pinecone evidence matches`);
    }
    return;
  }

  const results = [];
  for (const course of verifiedCourses) {
    process.stdout.write(`Searching YouTube from Pinecone evidence for ${course.title}... `);
    const videos = await searchYouTube(course);
    process.stdout.write(`${videos.length} candidates\n`);
    results.push({ course, videos });
  }

  const block = renderMarkdown(verifiedCourses, results);
  if (dryRun) {
    console.log(block);
    return;
  }

  await fs.mkdir(path.dirname(obsidianPath), { recursive: true });
  const existing = await fs.readFile(obsidianPath, "utf8").catch(() => "");
  await fs.writeFile(obsidianPath, upsertSection(existing, block), "utf8");
  console.log(`Updated ${obsidianPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
