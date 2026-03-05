"use client";

import { useState, useEffect } from "react";
import ClipCard from "./ClipCard";

interface Clip {
  clip_index: number;
  start_time: number;
  end_time: number;
  duration: number;
  score: number | null;
  clip_url: string | null;
  subtitle_url: string | null;
}

interface JobData {
  id: string;
  status: string;
  source_type: string;
  source_url: string | null;
  original_filename: string | null;
  error: string | null;
  clips?: Clip[];
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Waiting in queue...",
  downloading: "Downloading video...",
  queued: "Video saved, preparing transcription...",
  transcribing: "Transcribing audio with Whisper...",
  transcribed: "Transcript ready, starting analysis...",
  analyzing: "Analyzing transcript, selecting best segments...",
  analyzed: "Segments selected, rendering clips...",
  rendering: "Cutting clips with ffmpeg...",
  completed: "Done! Your clips are ready.",
  failed: "Job failed.",
};

const STATUS_ORDER = [
  "pending",
  "downloading",
  "queued",
  "transcribing",
  "transcribed",
  "analyzing",
  "analyzed",
  "rendering",
  "completed",
];

export default function JobStatus({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<JobData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) {
          setError("Failed to fetch job status");
          return;
        }
        const data: JobData = await res.json();
        if (active) {
          setJob(data);
          if (data.status !== "completed" && data.status !== "failed") {
            timer = setTimeout(poll, 1500);
          }
        }
      } catch {
        if (active) setError("Network error");
      }
    }

    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [jobId]);

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-800 rounded-lg p-4">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!job) {
    return <p className="text-gray-500">Loading...</p>;
  }

  const stepIndex = STATUS_ORDER.indexOf(job.status);
  const totalSteps = STATUS_ORDER.length - 1; // exclude "completed"
  const progress =
    job.status === "completed"
      ? 100
      : job.status === "failed"
        ? 0
        : Math.round((stepIndex / totalSteps) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm text-gray-500 mb-1">
          {job.source_type === "youtube" ? job.source_url : job.original_filename}
        </p>
        <p className="text-lg font-medium">
          {STATUS_LABELS[job.status] || job.status}
        </p>
      </div>

      {/* Progress bar */}
      {job.status !== "failed" && (
        <div className="w-full bg-gray-800 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              job.status === "completed" ? "bg-green-500" : "bg-blue-500"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Error message */}
      {job.status === "failed" && job.error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-4">
          <p className="text-red-400 text-sm font-mono">{job.error}</p>
        </div>
      )}

      {/* Clips */}
      {job.status === "completed" && job.clips && job.clips.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">
            {job.clips.length} Clips Extracted
          </h2>
          {job.clips.map((clip) => (
            <ClipCard key={clip.clip_index} clip={clip} />
          ))}
        </div>
      )}
    </div>
  );
}
