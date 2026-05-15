import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";

const DEFAULT_COURSES_PATH = "C:/Users/scott/Code/Aesop/ai-academy/modules/courses-data.json";
const DEFAULT_OBSIDIAN_PATH = "G:/My Drive/Aesop Academy/Obsidian/diamond_Build/7-Integrations.md";
const START = "<!-- watchlist-engine:start -->";
const END = "<!-- watchlist-engine:end -->";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : "true"];
  })
);

const coursesPath = args.get("courses") || DEFAULT_COURSES_PATH;
const obsidianPath = args.get("obsidian") || DEFAULT_OBSIDIAN_PATH;
const maxCourses = Number(args.get("limit-courses") || 12);
const videosPerCourse = Number(args.get("videos-per-course") || 2);
const dryRun = args.get("dry-run") === "true";

const preferredCourseIds = [
  "ai-agents-in-the-wild",
  "how-large-language-models-work",
  "gpt-vs-claude-vs-gemini",
  "running-models-locally",
  "model-evaluation-and-benchmarks",
  "the-alignment-problem",
  "the-reasoning-revolution",
  "the-context-window-race",
  "voice-and-real-time-ai",
  "synthetic-data-and-self-improvement",
  "ai-for-marketing-and-growth",
  "ai-leadership",
  "ai-risk-for-business-leaders",
  "ai-tools-for-solo-founders",
  "ai-and-finance",
  "image-generation-models"
];

const courseSearchAliases = {
  "model-evaluation-and-benchmarks": [
    "AI model evaluation benchmarks",
    "LLM evaluation benchmarks"
  ],
  "the-alignment-problem": [
    "AI alignment problem explained",
    "AI safety alignment problem"
  ],
  "the-reasoning-revolution": [
    "AI reasoning models explained",
    "large reasoning models explained"
  ],
  "the-context-window-race": [
    "long context window LLM",
    "LLM context length explained",
    "Gemini context window explained"
  ],
  "voice-and-real-time-ai": [
    "OpenAI realtime voice AI demo",
    "AI voice agents tutorial"
  ],
  "synthetic-data-and-self-improvement": [
    "synthetic data machine learning explained",
    "synthetic data LLM training"
  ],
  "ai-for-marketing-and-growth": [
    "AI marketing automation tutorial",
    "AI for marketing tutorial"
  ],
  "ai-leadership": [
    "AI leadership for executives",
    "AI adoption strategy for leaders",
    "leading AI transformation"
  ]
};

const fallbackVideos = {
  "model-evaluation-and-benchmarks": [
    ["kDY4TodQwbg", "What are Large Language Model (LLM) Benchmarks?", "IBM Technology", "6:21"],
    ["a3SMraZWNNs", "How to Systematically Setup LLM Evals (Metrics, Unit Tests, LLM-as-a-Judge)", "Dave Ebbelaar", "55:02"]
  ],
  "the-alignment-problem": [
    ["Sp3aCsQUsDc", "The Alignment Problem Explained: Crash Course Futures of AI #4", "CrashCourse", "12:23"],
    ["MUjvQvVJxHw", "What is AI Alignment and Why is it Important?", "Eye on Tech", "2:16"]
  ],
  "the-reasoning-revolution": [
    ["enLbj0igyx4", "What Are Large Reasoning Models (LRMs)? Smarter AI Beyond LLMs", "IBM Technology", "8:38"],
    ["xCRvOUykOX0", "How do thinking and reasoning models work?", "Google for Developers", "13:26"]
  ],
  "the-context-window-race": [
    ["-QVoIxEpFkM", "What is a Context Window? Unlocking LLM Secrets", "IBM Technology", "11:31"],
    ["TeQDr4DkLYo", "Why LLMs get dumb (Context Windows Explained)", "NetworkChuck", "15:18"]
  ],
  "voice-and-real-time-ai": [
    ["nfBbmtMJhX0", "Introducing gpt-realtime in the API", "OpenAI", "17:54"],
    ["qq13yG32rUk", "OpenAI Realtime API - The NEW ERA of Speech to Speech? - TESTED", "All About AI", "14:05"]
  ],
  "synthetic-data-and-self-improvement": [
    ["HIusawrGBN4", "What is Synthetic Data? No, It's Not \"Fake\" Data", "IBM Technology", "6:49"],
    ["4L-CB0lMq_I", "Synthetic Data Generation for Smarter AI Workflows", "IBM Technology", "3:50"]
  ],
  "ai-for-marketing-and-growth": [
    ["XKqNdX0qNRI", "How I Use AI to Automate 80% of My Marketing | 13 Strategies for Success", "Leveling Up with Eric Siu", "11:42"],
    ["ZT4LqD2_GwM", "How to Start an AI Marketing Agency (Step-by-Step Agency Startup Guide)", "Adam Erhart", "13:03"]
  ],
  "ai-leadership": [
    ["f-6wAvkaO-g", "AI and Leadership: The Smart Way for Managers to Use Artificial Intelligence | 2025", "David Burkus", "11:38"],
    ["CWEWBgVwFc8", "Leadership in the Age of AI | Paul Hudson and Lindsay Levin | TED", "TED", "17:34"]
  ]
};

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
      // YouTube occasionally emits renderer variants that are not clean JSON once extracted.
    }
    pos = end;
  }

  return out;
}

function courseText(course) {
  const modules = (course.modules || [])
    .slice(0, 4)
    .map((module) => [module.title, module.name, module.sub, module.subtitle].filter(Boolean).join(" "))
    .join(" ");
  return [course.name, course.title, course.desc, course.description, modules].filter(Boolean).join(" ");
}

function searchQueries(course) {
  const name = course.name || course.title || course.id;
  const firstModule = (course.modules || [])[0]?.title;
  const secondModule = (course.modules || [])[1]?.title;
  return [
    ...(courseSearchAliases[course.id] || []),
    [name, firstModule, "AI explained tutorial"].filter(Boolean).join(" "),
    [name, "AI explained"].filter(Boolean).join(" "),
    [firstModule, "AI tutorial"].filter(Boolean).join(" "),
    [secondModule, "AI explained"].filter(Boolean).join(" "),
    name
  ].filter(Boolean);
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

function scoreVideo(course, video) {
  const courseWords = words(courseText(course));
  const videoWords = words(`${video.title} ${video.channel}`);
  let overlap = 0;
  for (const word of videoWords) {
    if (courseWords.has(word)) overlap += 1;
  }
  const titleBonus = /explained|tutorial|guide|course|learn|beginner|clearly|deep dive/i.test(video.title) ? 3 : 0;
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

    if (unique.size >= videosPerCourse * 3) break;
  }

  if (unique.size === 0 && fallbackVideos[course.id]) {
    for (const [id, title, channel, duration] of fallbackVideos[course.id]) {
      unique.set(id, {
        id,
        title,
        channel,
        duration,
        url: `https://www.youtube.com/watch?v=${id}`,
        sourceQuery: "researched fallback seed"
      });
    }
  }

  return [...unique.values()]
    .map((video) => ({ ...video, score: scoreVideo(course, video) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, videosPerCourse);
}

function pickCourses(courses) {
  const byId = new Map(courses.map((course) => [course.id, course]));
  const preferred = preferredCourseIds.map((id) => byId.get(id)).filter(Boolean);
  const fallback = courses.filter((course) => course.live && !preferredCourseIds.includes(course.id));
  return [...preferred, ...fallback].slice(0, maxCourses);
}

function renderMarkdown(results) {
  const now = new Date().toISOString();
  const lines = [
    START,
    `Generated: ${now}`,
    "",
    "Purpose: curate public AI creator videos that match Aesop course topics, then route viewers back to the original creator video and the related Aesop course.",
    "",
    "Engine status:",
    "- Course source: `C:/Users/scott/Code/Aesop/ai-academy/modules/courses-data.json`",
    "- Current matching: YouTube search + local course/title relevance scoring",
    "- Pinecone next step: replace local scoring with embedding similarity against the existing course index",
    "- Publishing rule: human approval before anything goes live on 25experts",
    "",
    "### Candidate Videos",
    ""
  ];

  for (const item of results) {
    lines.push(`#### ${item.course.name || item.course.title} (${item.course.id})`);
    lines.push(`Course focus: ${item.course.desc || item.course.description || "No course description found."}`);
    lines.push("");
    for (const video of item.videos) {
      lines.push(`- [${video.title}](${video.url})`);
      lines.push(`  - Creator/channel: ${video.channel || "Unknown"}`);
      lines.push(`  - Duration: ${video.duration || "Unknown"}`);
      lines.push(`  - Match query: \`${video.sourceQuery}\``);
      lines.push(`  - Relevance score: ${video.score}`);
      lines.push("  - Watchlist angle: Celebrate the creator's explanation, then connect learners to the related Aesop course if they want structured practice.");
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
  const raw = await fs.readFile(coursesPath, "utf8");
  const data = JSON.parse(raw);
  const courses = pickCourses(data.courses || []);
  const results = [];

  for (const course of courses) {
    process.stdout.write(`Searching YouTube for ${course.id}... `);
    const videos = await searchYouTube(course);
    process.stdout.write(`${videos.length} candidates\n`);
    results.push({ course, videos });
  }

  const block = renderMarkdown(results);
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
  console.error(error);
  process.exitCode = 1;
});
