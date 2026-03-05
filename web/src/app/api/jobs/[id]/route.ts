import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/jobs/[id]
 *
 * Returns the current status of a job.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const job = getJob(params.id);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    source_type: job.source_type,
    source_url: job.source_url,
    original_filename: job.original_filename,
    video_path: job.video_path,
    error: job.error,
    created_at: job.created_at,
    updated_at: job.updated_at,
  });
}
