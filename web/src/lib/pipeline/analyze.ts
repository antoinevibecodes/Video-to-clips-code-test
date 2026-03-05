import { v4 as uuidv4 } from "uuid";
import { updateJobStatus, insertClips } from "../db";

const CLIP_MIN = parseInt(process.env.CLIP_MIN_DURATION || "15", 10);
const CLIP_MAX = parseInt(process.env.CLIP_MAX_DURATION || "60", 10);
const CLIPS_COUNT = parseInt(process.env.CLIPS_COUNT || "5", 10);

// Whisper verbose_json segment shape
interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

interface WhisperTranscript {
  segments: WhisperSegment[];
  duration?: number;
}

interface Candidate {
  startIdx: number;
  endIdx: number;
  start_time: number;
  end_time: number;
  duration: number;
  text: string;
  score: number;
  rationale: string;
}

export interface ClipResult {
  clip_index: number;
  start_time: number;
  end_time: number;
  duration: number;
  score: number;
  rationale: string;
}

// ── Hook patterns ──
const HOOK_PATTERNS = [
  /\?/g,                                          // questions
  /\b(how|why|what if|when|where)\b/gi,           // question words
  /\b(never|always|secret|amazing|incredible|unbelievable|insane|crazy)\b/gi,
  /\b(here'?s how|step|tip|trick|hack|strategy)\b/gi,
  /\b(you won'?t believe|most people|nobody|everybody)\b/gi,
  /\d+\s*(%|percent|dollar|million|billion)/gi,    // stats/numbers
  /\b(first|second|third|number \d)\b/gi,          // listicle signals
];

/**
 * Analyze transcript and select top CLIPS_COUNT non-overlapping segments.
 * Sets status: analyzing → analyzed.
 */
export async function analyze(
  jobId: string,
  transcriptJson: string
): Promise<void> {
  updateJobStatus(jobId, "analyzing");

  const transcript: WhisperTranscript = JSON.parse(transcriptJson);
  const segments = transcript.segments;

  if (!segments || segments.length === 0) {
    throw new Error("Transcript has no segments");
  }

  const videoDuration =
    transcript.duration ?? segments[segments.length - 1].end;

  // 1. Generate candidates by merging adjacent segments
  const candidates = generateCandidates(segments, videoDuration);

  if (candidates.length === 0) {
    throw new Error(
      `No valid candidates found (need segments between ${CLIP_MIN}–${CLIP_MAX}s)`
    );
  }

  // 2. Greedy non-overlapping selection
  const selected = selectNonOverlapping(candidates, CLIPS_COUNT);

  // 3. Sort by start_time and assign clip_index 1–N
  selected.sort((a, b) => a.start_time - b.start_time);
  const clips: ClipResult[] = selected.map((c, i) => ({
    clip_index: i + 1,
    start_time: c.start_time,
    end_time: c.end_time,
    duration: c.duration,
    score: Math.round(c.score * 100) / 100,
    rationale: c.rationale,
  }));

  // 4. Store in DB
  const clipRows = clips.map((c) => ({
    id: uuidv4(),
    job_id: jobId,
    clip_index: c.clip_index,
    start_time: c.start_time,
    end_time: c.end_time,
    duration: c.duration,
    score: c.score,
    rationale: c.rationale,
  }));

  insertClips(jobId, clipRows);
}

// ── Candidate generation ──

function generateCandidates(
  segments: WhisperSegment[],
  videoDuration: number
): Candidate[] {
  const candidates: Candidate[] = [];

  for (let i = 0; i < segments.length; i++) {
    let mergedText = "";
    for (let j = i; j < segments.length; j++) {
      mergedText += " " + segments[j].text;
      const start = segments[i].start;
      const end = segments[j].end;
      const duration = end - start;

      if (duration < CLIP_MIN) continue;
      if (duration > CLIP_MAX) break;

      const { score, rationale } = scoreCandidate(
        mergedText.trim(),
        start,
        end,
        duration,
        videoDuration,
        i === 0,
        j === segments.length - 1
      );

      candidates.push({
        startIdx: i,
        endIdx: j,
        start_time: round2(start),
        end_time: round2(end),
        duration: round2(duration),
        text: mergedText.trim(),
        score,
        rationale,
      });
    }
  }

  return candidates;
}

// ── Scoring ──

function scoreCandidate(
  text: string,
  start: number,
  end: number,
  duration: number,
  videoDuration: number,
  isFirst: boolean,
  isLast: boolean
): { score: number; rationale: string } {
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const reasons: string[] = [];

  // 1. Speech density (40%) — words per second, normalized 0–1
  const wps = wordCount / duration;
  // Typical speech: 2–3 wps. Map 0–4 wps → 0–1
  const densityScore = Math.min(wps / 4, 1);
  reasons.push(`speech:${round2(wps)}wps`);

  // 2. Hook tokens (35%) — count matches per second
  let hookCount = 0;
  for (const pattern of HOOK_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) hookCount += matches.length;
  }
  const hooksPerSec = hookCount / duration;
  // Normalize: 0.5 hooks/sec is very high → score 1
  const hookScore = Math.min(hooksPerSec / 0.5, 1);
  if (hookCount > 0) reasons.push(`hooks:${hookCount}`);

  // 3. Position bias (15%) — prefer first 75% of video
  const midpoint = (start + end) / 2;
  const relPos = midpoint / videoDuration;
  let posScore: number;
  if (relPos <= 0.25) {
    posScore = 1.0; // intro — strong hooks
  } else if (relPos <= 0.75) {
    posScore = 0.8; // middle — solid content
  } else {
    posScore = 0.5; // tail — often winding down
  }
  reasons.push(`pos:${round2(relPos)}`);

  // 4. Segment coherence (10%) — bonus for starting at segment boundary
  // (all candidates start at boundaries by construction, so reward shorter
  //  candidates that stay cohesive — fewer merged segments = tighter)
  const coherenceScore = isFirst || isLast ? 0.7 : 1.0;

  const totalScore =
    densityScore * 0.4 +
    hookScore * 0.35 +
    posScore * 0.15 +
    coherenceScore * 0.1;

  return {
    score: round2(totalScore * 100),
    rationale: reasons.join(", "),
  };
}

// ── Non-overlapping selection ──

function selectNonOverlapping(
  candidates: Candidate[],
  count: number
): Candidate[] {
  // Sort by score descending
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const selected: Candidate[] = [];

  for (const c of sorted) {
    if (selected.length >= count) break;
    const overlaps = selected.some(
      (s) => c.start_time < s.end_time && c.end_time > s.start_time
    );
    if (!overlaps) {
      selected.push(c);
    }
  }

  return selected;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
