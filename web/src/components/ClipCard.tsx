"use client";

interface ClipCardProps {
  clip: {
    clip_index: number;
    start_time: number;
    end_time: number;
    duration: number;
    score: number | null;
    title: string | null;
    caption: string | null;
    hashtags: string[] | null;
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
        {/* Title */}
        {clip.title && (
          <h3 className="font-semibold text-gray-100">{clip.title}</h3>
        )}

        {/* Caption */}
        {clip.caption && (
          <p className="text-gray-400 text-sm">{clip.caption}</p>
        )}

        {/* Info row */}
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-300">
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

        {/* Hashtags */}
        {clip.hashtags && clip.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {clip.hashtags.map((tag) => (
              <span
                key={tag}
                className="text-xs bg-gray-800 text-blue-300 px-2 py-0.5 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Download links */}
        <div className="flex gap-3 pt-1">
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
