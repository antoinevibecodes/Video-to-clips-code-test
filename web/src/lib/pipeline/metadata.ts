import { getJob, getClipsByJobId, updateClipMetadata, updateJobStatus } from "../db";

const METADATA_MODE = process.env.METADATA_MODE || "heuristic";
const METADATA_MODEL = process.env.METADATA_MODEL || "gpt-4o-mini";
const METADATA_MAX_TOKENS = parseInt(process.env.METADATA_MAX_TOKENS || "300", 10);
const METADATA_TEMPERATURE = parseFloat(process.env.METADATA_TEMPERATURE || "0.7");

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

/**
 * Generate title, caption, and hashtags for each clip.
 * Sets status: generating_metadata → completed.
 */
export async function generateMetadata(jobId: string): Promise<void> {
  updateJobStatus(jobId, "generating_metadata");

  const job = getJob(jobId);
  if (!job?.transcript) {
    throw new Error("No transcript found for metadata generation");
  }

  let segments: WhisperSegment[] = [];
  try {
    const t = JSON.parse(job.transcript);
    segments = t.segments || [];
  } catch {}

  const clips = getClipsByJobId(jobId);

  for (const clip of clips) {
    const clipText = extractClipText(segments, clip.start_time, clip.end_time);

    let title: string;
    let caption: string;
    let hashtags: string[];

    if (METADATA_MODE === "llm") {
      const result = await generateWithLlm(clipText, clip.clip_index);
      title = result.title;
      caption = result.caption;
      hashtags = result.hashtags;
    } else {
      const result = generateWithHeuristic(clipText, clip.clip_index);
      title = result.title;
      caption = result.caption;
      hashtags = result.hashtags;
    }

    updateClipMetadata(clip.id, title, caption, JSON.stringify(hashtags));
  }

  updateJobStatus(jobId, "completed");
}

function extractClipText(
  segments: WhisperSegment[],
  start: number,
  end: number
): string {
  return segments
    .filter((s) => s.end > start && s.start < end)
    .map((s) => s.text.trim())
    .join(" ")
    .trim();
}

// ── Heuristic mode ──

function generateWithHeuristic(
  text: string,
  clipIndex: number
): { title: string; caption: string; hashtags: string[] } {
  const words = text.split(/\s+/).filter(Boolean);
  const hasQuestion = /\?/.test(text);
  const hasHow = /\b(how|here'?s how|step|tip)\b/i.test(text);
  const hasStory = /\b(story|happened|remember|once)\b/i.test(text);
  const hasClaim = /\b(never|always|secret|amazing|best|worst)\b/i.test(text);

  // Build a title from the first ~10 words, cleaned up
  let titleBase = words.slice(0, 10).join(" ");
  // End at a natural break if possible
  const breakMatch = titleBase.match(/^(.{20,}?)[.!?,]/);
  if (breakMatch) titleBase = breakMatch[1];
  // Remove trailing partial words
  titleBase = titleBase.replace(/\s\S*$/, "").trim();
  if (!titleBase && words.length > 0) titleBase = words.slice(0, 6).join(" ");

  let title = titleBase;
  if (hasQuestion) title = `"${titleBase}?"`;
  else if (hasHow) title = `How to ${titleBase.toLowerCase()}`;
  else if (hasClaim) title = `${titleBase} — You Need to Hear This`;
  else title = `${titleBase}`;
  // Fallback
  if (!title || title.length < 5) title = `Clip ${clipIndex} Highlight`;

  // Caption: first sentence or first ~25 words
  const firstSentence = text.match(/^[^.!?]+[.!?]/);
  const caption = firstSentence
    ? firstSentence[0].trim()
    : words.slice(0, 25).join(" ") + "...";

  // Hashtags: extract notable words + generic tags
  const topicWords = words
    .filter((w) => w.length > 4 && /^[a-zA-Z]+$/.test(w))
    .map((w) => w.toLowerCase());
  const unique = [...new Set(topicWords)];
  const topicTags = unique.slice(0, 5).map((w) => `#${w}`);
  const genericTags = ["#clips", "#highlights", "#viral", "#shorts"];
  const hashtags = [...new Set([...topicTags, ...genericTags])].slice(0, 10);

  return { title, caption, hashtags };
}

// ── LLM mode ──

async function generateWithLlm(
  text: string,
  clipIndex: number
): Promise<{ title: string; caption: string; hashtags: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for LLM metadata mode");
  }

  // Truncate text to ~500 words to keep costs low
  const truncated = text.split(/\s+/).slice(0, 500).join(" ");

  const prompt = `You are a social media expert. Given this video clip transcript, generate metadata for sharing.

Transcript:
"${truncated}"

Respond ONLY with valid JSON (no markdown):
{
  "title": "hooky title, 6-12 words, attention-grabbing",
  "caption": "1-2 line caption for social media post",
  "hashtags": ["#tag1", "#tag2", "...5-12 relevant hashtags"]
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: METADATA_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: METADATA_MAX_TOKENS,
      temperature: METADATA_TEMPERATURE,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM API error (${response.status}): ${body}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  try {
    const parsed = JSON.parse(content);
    return {
      title: parsed.title || `Clip ${clipIndex}`,
      caption: parsed.caption || "",
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
    };
  } catch {
    // Fallback if LLM returns invalid JSON
    return generateWithHeuristic(text, clipIndex);
  }
}
