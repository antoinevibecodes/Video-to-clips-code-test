# Video-to-Clips MVP — Architecture & Plan

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Next.js App (web/)                 │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Upload    │  │  Job Status  │  │  Results     │  │
│  │  Page      │  │  Polling     │  │  + Preview   │  │
│  └───────────┘  └──────────────┘  └──────────────┘  │
│                                                     │
│  API Routes:                                        │
│    POST /api/jobs      (upload file or YouTube URL)  │
│    GET  /api/jobs/[id] (poll status + results)      │
│    GET  /api/clips/[file] (serve clip files)        │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│              Worker Pipeline (in-process)            │
│                                                     │
│  1. Ingest    — save upload / yt-dlp download       │
│  2. Transcribe— ffmpeg extract audio → Whisper API  │
│  3. Analyze   — score segments, pick top 5          │
│  4. Render    — ffmpeg cut clips + burn subtitles   │
│  5. Package   — generate metadata (title, caption,  │
│                 hashtags) per clip                   │
└─────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│                    Storage                           │
│  SQLite (jobs + clips metadata)                     │
│  Local filesystem: data/uploads/, data/clips/       │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer         | Choice                       | Rationale                        |
|---------------|------------------------------|----------------------------------|
| Frontend      | Next.js 14 App Router + Tailwind | Boring, reliable, full-stack   |
| Backend       | Next.js API routes           | No extra server needed           |
| Worker        | In-process async queue       | Simple for MVP, no Redis needed  |
| Database      | SQLite via better-sqlite3    | Zero config, file-based          |
| Transcription | OpenAI Whisper API           | Most reliable, no GPU needed     |
| Media         | ffmpeg (system binary)       | Industry standard                |
| YouTube DL    | yt-dlp (system binary)       | Best maintained fork             |
| Containerized | Docker + docker-compose      | Reproducible local dev           |

## Folder Structure

```
/
├── web/                        # Next.js application
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx           # Upload form (main page)
│   │   │   ├── jobs/[id]/page.tsx # Job status + results page
│   │   │   ├── layout.tsx
│   │   │   └── globals.css
│   │   ├── api/
│   │   │   ├── jobs/
│   │   │   │   ├── route.ts       # POST: create job
│   │   │   │   └── [id]/route.ts  # GET: job status
│   │   │   └── clips/
│   │   │       └── [...path]/route.ts  # Serve clip files
│   │   ├── components/
│   │   │   ├── UploadForm.tsx
│   │   │   ├── JobStatus.tsx
│   │   │   └── ClipCard.tsx
│   │   └── lib/
│   │       ├── db.ts              # SQLite setup + queries
│   │       ├── queue.ts           # Simple in-process job queue
│   │       └── pipeline/
│   │           ├── ingest.ts      # Download / save video
│   │           ├── transcribe.ts  # Extract audio + Whisper
│   │           ├── analyze.ts     # Score & select segments
│   │           ├── render.ts      # ffmpeg clip cutting
│   │           └── metadata.ts    # Title/caption/hashtag gen
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── next.config.js
├── data/                       # Runtime data (gitignored)
│   ├── uploads/
│   ├── clips/
│   └── db.sqlite
├── Dockerfile
├── docker-compose.yml
├── RUNBOOK.md
├── PLAN.md
└── .gitignore
```

## Implementation Phases (5 Tasks)

### Phase 1: Project Scaffolding
- Initialize Next.js + Tailwind project in `web/`
- Set up SQLite database schema (jobs, clips tables)
- Create Docker setup (Dockerfile + docker-compose.yml with ffmpeg, yt-dlp)
- Create `.gitignore`, `RUNBOOK.md`
- **Verify:** `docker-compose up` starts the app, visit http://localhost:3000

### Phase 2: Ingest Pipeline
- Build upload API (`POST /api/jobs`) — accepts mp4/mov file upload or YouTube URL
- Implement file save to `data/uploads/`
- Implement yt-dlp download for YouTube URLs
- Create in-process job queue that processes jobs sequentially
- Wire up job status API (`GET /api/jobs/[id]`)
- **Verify:** `curl -X POST` with a file → job created, status returns `processing`

### Phase 3: Transcription + Analysis
- Extract audio from video with ffmpeg (→ WAV)
- Send audio to OpenAI Whisper API, get transcript with word-level timestamps
- Implement segment scoring heuristic:
  - Prefer segments 15–60 seconds long
  - Score based on: speech density, keyword signals (questions, stories, strong opinions), natural pause boundaries
  - Pick top 5 non-overlapping segments
- Store transcript + selected segments in DB
- **Verify:** Process a sample video, check DB for 5 segments with start/end times

### Phase 4: Clip Rendering
- Cut clips with ffmpeg using selected timestamps
- Generate SRT subtitles from transcript segments
- Optionally burn subtitles into clips with ffmpeg
- Store clip files in `data/clips/{jobId}/`
- Update job status to `completed` with clip metadata
- **Verify:** Check `data/clips/` for 5 MP4 files, playable with subtitles

### Phase 5: Frontend UI
- Build upload form (drag-and-drop file + YouTube URL input)
- Build job status page with polling
- Build results view: video preview player for each clip, download button
- Display generated title, caption, hashtags per clip
- **Verify:** Full flow — upload video in browser → see 5 clips with previews

## Key Design Decisions

1. **In-process queue over BullMQ** — No Redis dependency for MVP. Jobs process one at a time via a simple async queue. Easy to swap for BullMQ later.

2. **OpenAI Whisper API over local Whisper** — Avoids GPU/Python dependency in Docker. Requires an API key but is far simpler to set up. Falls back cleanly.

3. **SQLite over Postgres** — Zero config. Single file. Good enough for single-user MVP.

4. **Scoring heuristic over LLM analysis** — Keeps it fast, cheap, and deterministic. Phase 3 uses transcript text analysis (speech density, keywords, pauses) rather than sending to an LLM. Can upgrade later.

5. **No S3, no CDN** — Local filesystem with Next.js API route serving files. Simple and correct for local dev.

## Database Schema

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|downloading|transcribing|analyzing|rendering|completed|failed
  source_type TEXT NOT NULL,               -- 'upload' | 'youtube'
  source_url TEXT,                         -- YouTube URL if applicable
  original_filename TEXT,
  video_path TEXT,                         -- path to downloaded/uploaded video
  transcript TEXT,                         -- full transcript JSON
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE clips (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  clip_index INTEGER NOT NULL,             -- 1-5
  start_time REAL NOT NULL,                -- seconds
  end_time REAL NOT NULL,                  -- seconds
  duration REAL NOT NULL,
  title TEXT,
  caption TEXT,
  hashtags TEXT,                           -- JSON array
  clip_path TEXT,                          -- path to rendered clip
  subtitle_path TEXT,                      -- path to SRT file
  score REAL,
  created_at TEXT NOT NULL
);
```

## Environment Variables

```
OPENAI_API_KEY=sk-...          # Required for Whisper API
MAX_VIDEO_DURATION=3600        # 60 min default cap
CLIPS_COUNT=5                  # Number of clips to generate
CLIP_MIN_DURATION=15           # Minimum clip length in seconds
CLIP_MAX_DURATION=60           # Maximum clip length in seconds
```
