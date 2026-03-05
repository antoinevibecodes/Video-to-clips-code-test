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

  // Use yt-dlp output template — %(ext)s lets yt-dlp choose the real extension
  const outputTemplate = path.join(UPLOADS_DIR, `${jobId}.%(ext)s`);
  const expectedPath = path.join(UPLOADS_DIR, `${jobId}.mp4`);

  return new Promise((resolve, reject) => {
    execFile(
      "yt-dlp",
      [
        "--match-filter",
        `duration <= ${MAX_VIDEO_DURATION}`,
        "-f",
        "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "--merge-output-format",
        "mp4",
        "-o",
        outputTemplate,
        "--no-playlist",
        "--verbose",
        url,
      ],
      { timeout: 600_000 },
      (error, stdout, stderr) => {
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

        // Log output for debugging
        console.log("[yt-dlp stdout]", stdout);
        if (stderr) console.log("[yt-dlp stderr]", stderr);

        // Check if the expected file exists
        if (fs.existsSync(expectedPath)) {
          resolve(expectedPath);
          return;
        }

        // yt-dlp may have saved with a different extension — find it
        const files = fs.readdirSync(UPLOADS_DIR).filter(f => f.startsWith(jobId));
        console.log("[yt-dlp] Files matching jobId:", files);

        if (files.length > 0) {
          const actualPath = path.join(UPLOADS_DIR, files[0]);
          resolve(actualPath);
        } else {
          reject(new Error(
            `yt-dlp completed but no file was created. stdout: ${stdout}, stderr: ${stderr}`
          ));
        }
      }
    );
  });
}
