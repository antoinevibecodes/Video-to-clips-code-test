import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { updateJobStatus, getClipsByJobId, updateClipPaths, getJob } from "../db";

const CLIPS_DIR = path.resolve(process.cwd(), "..", "data", "clips");

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

/**
 * Cut 5 MP4 clips with ffmpeg and generate SRT subtitles.
 * Sets status to rendering. Completed status set by metadata step.
 */
export async function render(jobId: string): Promise<void> {
  updateJobStatus(jobId, "rendering");

  const clips = getClipsByJobId(jobId);
  if (clips.length === 0) {
    throw new Error("No clip segments found for this job");
  }

  const job = getJob(jobId);
  if (!job?.video_path) {
    throw new Error("No video file found for this job");
  }

  // Parse transcript for SRT generation
  let segments: WhisperSegment[] = [];
  if (job.transcript) {
    try {
      const t = JSON.parse(job.transcript);
      segments = t.segments || [];
    } catch {}
  }

  const jobClipsDir = path.join(CLIPS_DIR, jobId);
  fs.mkdirSync(jobClipsDir, { recursive: true });

  for (const clip of clips) {
    const clipFile = `clip-${clip.clip_index}.mp4`;
    const srtFile = `clip-${clip.clip_index}.srt`;
    const clipPath = path.join(jobClipsDir, clipFile);
    const srtPath = path.join(jobClipsDir, srtFile);

    // 1. Cut clip with ffmpeg
    await cutClip(job.video_path, clipPath, clip.start_time, clip.end_time);

    // 2. Generate SRT from overlapping transcript segments
    const srtContent = generateSrt(segments, clip.start_time, clip.end_time);
    if (srtContent) {
      fs.writeFileSync(srtPath, srtContent);
      updateClipPaths(clip.id, clipPath, srtPath);
    } else {
      updateClipPaths(clip.id, clipPath, null);
    }
  }

  // Status "completed" is now set by metadata step
}

function cutClip(
  videoPath: string,
  outputPath: string,
  startTime: number,
  endTime: number
): Promise<void> {
  const duration = endTime - startTime;
  return new Promise((resolve, reject) => {
    execFile(
      "ffmpeg",
      [
        "-ss", String(startTime),
        "-i", videoPath,
        "-t", String(duration),
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        "-y",
        outputPath,
      ],
      { timeout: 300_000 },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`ffmpeg clip cut failed: ${stderr || error.message}`));
          return;
        }
        resolve();
      }
    );
  });
}

function generateSrt(
  segments: WhisperSegment[],
  clipStart: number,
  clipEnd: number
): string | null {
  // Find segments that overlap with clip time range
  const overlapping = segments.filter(
    (s) => s.end > clipStart && s.start < clipEnd
  );

  if (overlapping.length === 0) return null;

  const lines: string[] = [];
  let index = 1;

  for (const seg of overlapping) {
    // Clamp to clip boundaries and offset to clip-relative time
    const start = Math.max(seg.start, clipStart) - clipStart;
    const end = Math.min(seg.end, clipEnd) - clipStart;
    const text = seg.text.trim();
    if (!text) continue;

    lines.push(String(index));
    lines.push(`${formatSrtTime(start)} --> ${formatSrtTime(end)}`);
    lines.push(text);
    lines.push("");
    index++;
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0") +
    "," +
    String(ms).padStart(3, "0")
  );
}
