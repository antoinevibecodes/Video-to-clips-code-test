import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { updateJobStatus, updateJobTranscript } from "../db";

const WHISPER_MODEL = process.env.WHISPER_MODEL || "whisper-1";

/**
 * Extract audio from video via ffmpeg, send to Whisper API, store transcript.
 * Sets status: transcribing → transcribed.
 */
export async function transcribe(
  jobId: string,
  videoPath: string
): Promise<void> {
  updateJobStatus(jobId, "transcribing");

  const audioPath = videoPath.replace(/\.[^.]+$/, ".wav");

  // 1. Extract audio with ffmpeg
  await extractAudio(videoPath, audioPath);

  // 2. Call Whisper API
  const transcript = await callWhisperApi(audioPath);

  // 3. Store transcript and update status
  updateJobTranscript(jobId, transcript);

  // Clean up audio file
  try {
    fs.unlinkSync(audioPath);
  } catch {}
}

function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      "ffmpeg",
      [
        "-i",
        videoPath,
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-y",
        audioPath,
      ],
      { timeout: 300_000 },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`ffmpeg audio extraction failed: ${stderr || error.message}`));
          return;
        }
        resolve();
      }
    );
  });
}

async function callWhisperApi(audioPath: string): Promise<object> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const fileBuffer = fs.readFileSync(audioPath);
  const fileName = path.basename(audioPath);

  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), fileName);
  formData.append("model", WHISPER_MODEL);
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "segment");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Whisper API error (${response.status}): ${body}`);
  }

  return response.json();
}
