import { NextRequest, NextResponse } from "next/server";
import Busboy from "busboy";
import { Readable } from "stream";
import { v4 as uuidv4 } from "uuid";
import { createJob } from "@/lib/db";
import { enqueue } from "@/lib/queue";

export const runtime = "nodejs";

// Disable Next.js body parsing so we can handle multipart ourselves
export const dynamic = "force-dynamic";

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
      const busboy = Busboy({ headers: { "content-type": contentType } });

      let fileBuffer: Buffer | null = null;
      let originalFilename = "upload.mp4";
      const chunks: Buffer[] = [];

      busboy.on("file", (_fieldname, stream, info) => {
        originalFilename = info.filename || originalFilename;
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          fileBuffer = Buffer.concat(chunks);
        });
      });

      busboy.on("finish", () => {
        if (!fileBuffer || fileBuffer.length === 0) {
          resolve(
            NextResponse.json(
              { error: "No file uploaded" },
              { status: 400 }
            )
          );
          return;
        }

        const jobId = uuidv4();
        const job = createJob({
          id: jobId,
          source_type: "upload",
          original_filename: originalFilename,
        });

        enqueue({
          jobId,
          type: "upload",
          fileBuffer,
          originalFilename,
        });

        resolve(NextResponse.json(job, { status: 201 }));
      });

      busboy.on("error", (err: Error) => {
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
