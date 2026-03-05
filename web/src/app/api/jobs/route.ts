import { NextRequest, NextResponse } from "next/server";
import Busboy from "busboy";
import { Readable } from "stream";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { createJob } from "@/lib/db";
import { enqueue } from "@/lib/queue";

export const runtime = "nodejs";

// Disable Next.js body parsing so we can handle multipart ourselves
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = parseInt(
  process.env.MAX_UPLOAD_BYTES || String(1024 * 1024 * 1024),
  10
); // default 1 GB

const UPLOADS_DIR = path.resolve(process.cwd(), "..", "data", "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function isValidYoutubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "www.youtube.com" ||
      parsed.hostname === "youtube.com" ||
      parsed.hostname === "youtu.be" ||
      parsed.hostname === "m.youtube.com"
    );
  } catch {
    return false;
  }
}

/**
 * POST /api/jobs
 *
 * Accepts either:
 *   1. JSON body: { "url": "https://youtube.com/watch?v=..." }
 *   2. Multipart form-data with a "file" field (video upload)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const contentType = request.headers.get("content-type") || "";

  // ── JSON body (YouTube URL) ──
  if (contentType.includes("application/json")) {
    const body = await request.json();
    const url = body.url;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Missing required field: url" },
        { status: 400 }
      );
    }

    if (!isValidYoutubeUrl(url)) {
      return NextResponse.json(
        { error: "Invalid YouTube URL" },
        { status: 400 }
      );
    }

    const jobId = uuidv4();
    const job = createJob({ id: jobId, source_type: "youtube", source_url: url });

    enqueue({ jobId, type: "youtube", url });

    return NextResponse.json(job, { status: 201 });
  }

  // ── Multipart form-data (file upload) ──
  if (contentType.includes("multipart/form-data")) {
    return new Promise<NextResponse>((resolve) => {
      const jobId = uuidv4();
      let originalFilename = "upload.mp4";
      let fileReceived = false;
      let limitExceeded = false;
      let videoPath = "";

      const busboy = Busboy({
        headers: { "content-type": contentType },
        limits: { fileSize: MAX_UPLOAD_BYTES },
      });

      busboy.on("file", (_fieldname, stream, info) => {
        fileReceived = true;
        originalFilename = info.filename || originalFilename;
        const ext = path.extname(originalFilename) || ".mp4";
        videoPath = path.join(UPLOADS_DIR, `${jobId}${ext}`);

        const writeStream = fs.createWriteStream(videoPath);
        stream.pipe(writeStream);

        stream.on("limit", () => {
          limitExceeded = true;
          stream.unpipe(writeStream);
          writeStream.destroy();
          // Clean up partial file
          try { fs.unlinkSync(videoPath); } catch {}
        });
      });

      busboy.on("finish", () => {
        if (limitExceeded) {
          resolve(
            NextResponse.json(
              {
                error: `File exceeds maximum upload size of ${MAX_UPLOAD_BYTES} bytes`,
              },
              { status: 413 }
            )
          );
          return;
        }

        if (!fileReceived) {
          resolve(
            NextResponse.json(
              { error: "No file uploaded" },
              { status: 400 }
            )
          );
          return;
        }

        const job = createJob({
          id: jobId,
          source_type: "upload",
          original_filename: originalFilename,
        });

        enqueue({ jobId, type: "upload", videoPath });

        resolve(NextResponse.json(job, { status: 201 }));
      });

      busboy.on("error", (err: Error) => {
        // Clean up partial file on error
        if (videoPath) {
          try { fs.unlinkSync(videoPath); } catch {}
        }
        resolve(
          NextResponse.json(
            { error: `Upload failed: ${err.message}` },
            { status: 500 }
          )
        );
      });

      // Pipe the request body into busboy
      const reader = request.body?.getReader();
      if (!reader) {
        resolve(
          NextResponse.json({ error: "No request body" }, { status: 400 })
        );
        return;
      }

      const nodeStream = new Readable({
        async read() {
          const { done, value } = await reader.read();
          if (done) {
            this.push(null);
          } else {
            this.push(Buffer.from(value));
          }
        },
      });

      nodeStream.pipe(busboy);
    });
  }

  return NextResponse.json(
    {
      error:
        "Unsupported content type. Use application/json or multipart/form-data.",
    },
    { status: 415 }
  );
}
