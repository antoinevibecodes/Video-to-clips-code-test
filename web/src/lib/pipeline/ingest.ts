import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { updateJobStatus } from "../db";

const UPLOADS_DIR = path.resolve(process.cwd(), "..", "data", "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MAX_VIDEO_DURATION = parseInt(
  process.env.MAX_VIDEO_DURATION || "3600",
  10
);

/**
 * Download a YouTube video using yt-dlp into data/uploads/{jobId}.mp4
 * Rejects videos longer than MAX_VIDEO_DURATION seconds.
 */
export async function downloadYoutube(
  jobId: string,
  url: string
): Promise<string> {
  updateJobStatus(jobId, "downloading");

  const outputPath = path.join(UPLOADS_DIR, `${jobId}.mp4`);

  return new Promise((resolve, reject) => {
    execFile(
      "yt-dlp",
      [
        "--match-filter",
        `duration <= ${MAX_VIDEO_DURATION}`,
        "-f",
        "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4",
        "--merge-output-format",
        "mp4",
        "-o",
        outputPath,
        "--no-playlist",
        url,
      ],
      { timeout: 600_000 },
      (error, _stdout, stderr) => {
        if (error) {
          const msg = stderr || error.message;
          if (msg.includes("does not pass filter")) {
            reject(
              new Error(
                `Video exceeds maximum duration of ${MAX_VIDEO_DURATION} seconds`
              )
            );
          } else {
            reject(new Error(`yt-dlp failed: ${msg}`));
          }
          return;
        }
        resolve(outputPath);
      }
    );
  });
}
