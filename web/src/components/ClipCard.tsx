"use client";

interface ClipCardProps {
  clip: {
    clip_index: number;
    start_time: number;
    end_time: number;
    duration: number;
    score: number | null;
    clip_url: string | null;
    subtitle_url: string | null;
  };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ClipCard({ clip }: ClipCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      {/* Video preview */}
      {clip.clip_url && (
        <video
          src={clip.clip_url}
          controls
          preload="metadata"
          className="w-full aspect-video bg-black"
        />
      )}

      <div className="p-4 space-y-3">
        {/* Info row */}
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-200">
            Clip {clip.clip_index}
          </span>
          <span className="text-gray-500">
            {formatTime(clip.start_time)} – {formatTime(clip.end_time)}
            {" "}({clip.duration.toFixed(1)}s)
          </span>
          {clip.score !== null && (
            <span className="text-blue-400 font-mono text-xs">
              score: {clip.score}
            </span>
          )}
        </div>

        {/* Download links */}
        <div className="flex gap-3">
          {clip.clip_url && (
            <a
              href={clip.clip_url}
              download={`clip-${clip.clip_index}.mp4`}
              className="text-sm text-blue-400 hover:text-blue-300 underline"
            >
              Download MP4
            </a>
          )}
          {clip.subtitle_url && (
            <a
              href={clip.subtitle_url}
              download={`clip-${clip.clip_index}.srt`}
              className="text-sm text-blue-400 hover:text-blue-300 underline"
            >
              Download SRT
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
