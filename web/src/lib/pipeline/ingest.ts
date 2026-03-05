import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import { updateJobStatus } from "../db";

const UPLOADS_DIR = path.resolve(process.cwd(), "..", "data", "uploads");

/**
 * Download a YouTube video using yt-dlp into data/uploads/{jobId}.mp4
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
          reject(new Error(`yt-dlp failed: ${stderr || error.message}`));
          return;
        }
        resolve(outputPath);
      }
    );
  });
}

/**
 * Save an uploaded file buffer to data/uploads/{jobId}.{ext}
 */
export function saveUploadedFile(
  jobId: string,
  buffer: Buffer,
  originalFilename: string
): string {
  const ext = path.extname(originalFilename) || ".mp4";
  const outputPath = path.join(UPLOADS_DIR, `${jobId}${ext}`);
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}
