import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const CLIPS_DIR = path.resolve(process.cwd(), "..", "data", "clips");

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".srt": "text/plain; charset=utf-8",
};

/**
 * GET /api/clips/[jobId]/[filename]
 *
 * Streams clip or subtitle files from disk.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
): Promise<NextResponse | Response> {
  const segments = params.path;

  if (segments.length !== 2) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const [jobId, filename] = segments;

  // Sanitize: only allow alphanumeric, hyphens, dots
  if (!/^[a-zA-Z0-9-]+$/.test(jobId) || !/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const filePath = path.join(CLIPS_DIR, jobId, filename);

  // Prevent path traversal
  if (!filePath.startsWith(CLIPS_DIR)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const stat = fs.statSync(filePath);

  // Stream file using ReadableStream (no full-file buffering)
  const stream = fs.createReadStream(filePath);
  const readable = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk: Buffer) => controller.enqueue(chunk));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
