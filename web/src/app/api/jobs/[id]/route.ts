import { NextRequest, NextResponse } from "next/server";
import { getJob, getClipsByJobId } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/jobs/[id]
 *
 * Returns job status. When completed, includes clips with download URLs.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const job = getJob(params.id);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const baseUrl = new URL(request.url).origin;

  const response: Record<string, unknown> = {
    id: job.id,
    status: job.status,
    source_type: job.source_type,
    source_url: job.source_url,
    original_filename: job.original_filename,
    video_path: job.video_path,
    error: job.error,
    created_at: job.created_at,
    updated_at: job.updated_at,
  };

  // Include clips once they exist (analyzed or completed)
  if (["analyzed", "rendering", "generating_metadata", "completed"].includes(job.status)) {
    const clips = getClipsByJobId(job.id);
    response.clips = clips.map((c) => ({
      clip_index: c.clip_index,
      start_time: c.start_time,
      end_time: c.end_time,
      duration: c.duration,
      score: c.score,
      title: c.title,
      caption: c.caption,
      hashtags: c.hashtags ? JSON.parse(c.hashtags) : null,
      clip_url: c.clip_path
        ? `${baseUrl}/api/clips/${job.id}/clip-${c.clip_index}.mp4`
        : null,
      subtitle_url: c.subtitle_path
        ? `${baseUrl}/api/clips/${job.id}/clip-${c.clip_index}.srt`
        : null,
    }));
  }

  return NextResponse.json(response);
}
