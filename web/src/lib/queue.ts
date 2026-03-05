import { updateJobStatus, getJob } from "./db";
import { downloadYoutube } from "./pipeline/ingest";
import { transcribe } from "./pipeline/transcribe";
import { analyze } from "./pipeline/analyze";
import { render } from "./pipeline/render";
import { generateMetadata } from "./pipeline/metadata";

interface QueueItem {
  jobId: string;
  type: "upload" | "youtube";
  url?: string;
  videoPath?: string;
}

const queue: QueueItem[] = [];
let processing = false;

export function enqueue(item: QueueItem): void {
  queue.push(item);
  processNext();
}

async function processNext(): Promise<void> {
  if (processing || queue.length === 0) return;
  processing = true;

  const item = queue.shift()!;

  try {
    let videoPath: string;

    if (item.type === "youtube") {
      // downloadYoutube sets status to "downloading" internally
      videoPath = await downloadYoutube(item.jobId, item.url!);
    } else {
      // File already written to disk by the API route
      videoPath = item.videoPath!;
    }

    updateJobStatus(item.jobId, "queued", { video_path: videoPath });

    // Phase 2: transcribe (sets status transcribing → transcribed)
    await transcribe(item.jobId, videoPath);

    // Phase 3: analyze transcript → select clip segments (analyzing → analyzed)
    const job = getJob(item.jobId);
    if (job?.transcript) {
      await analyze(item.jobId, job.transcript);
    }

    // Phase 4: render clips with ffmpeg (rendering)
    await render(item.jobId);

    // Phase 6: generate metadata (generating_metadata → completed)
    await generateMetadata(item.jobId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    updateJobStatus(item.jobId, "failed", { error: message });
  } finally {
    processing = false;
    processNext();
  }
}
