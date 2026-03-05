import { updateJobStatus } from "./db";
import { downloadYoutube } from "./pipeline/ingest";

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

    // Phase 1 stops here — mark as "queued" (ready for transcription in Phase 3)
    updateJobStatus(item.jobId, "queued", { video_path: videoPath });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    updateJobStatus(item.jobId, "failed", { error: message });
  } finally {
    processing = false;
    processNext();
  }
}
