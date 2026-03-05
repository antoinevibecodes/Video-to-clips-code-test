# Runbook — Video to Clips MVP

## Prerequisites

- **Node.js** ≥ 20
- **npm** ≥ 10
- **ffmpeg** (system binary)
- **yt-dlp** (system binary, for YouTube downloads)

Or just use **Docker** (includes everything).

## Environment Variables (optional)

| Variable | Default | Description |
|---|---|---|
| `MAX_UPLOAD_BYTES` | `1073741824` (1 GB) | Maximum file upload size in bytes |
| `MAX_VIDEO_DURATION` | `3600` (60 min) | Maximum YouTube video duration in seconds |
| `OPENAI_API_KEY` | — | **Required** for transcription (Phase 2+) |
| `WHISPER_MODEL` | `whisper-1` | OpenAI Whisper model to use |

---

## Local Development (without Docker)

```bash
# 1. Install dependencies
cd web
npm install

# 2. Create data directories
mkdir -p ../data/uploads ../data/clips

# 3. Start dev server
npm run dev
# → http://localhost:3000
```

## Docker

```bash
# Build and start
docker-compose up --build

# → http://localhost:3000
```

---

## API Usage (Phase 1)

### Create a job from a YouTube URL

```bash
curl -s -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' | jq .
```

**Expected response (201):**
```json
{
  "id": "a1b2c3d4-...",
  "status": "pending",
  "source_type": "youtube",
  "source_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "original_filename": null,
  "video_path": null,
  "transcript": null,
  "error": null,
  "created_at": "2026-03-05T12:00:00.000Z",
  "updated_at": "2026-03-05T12:00:00.000Z"
}
```

### Create a job via file upload

```bash
curl -s -X POST http://localhost:3000/api/jobs \
  -F "file=@/path/to/video.mp4" | jq .
```

**Expected response (201):**
```json
{
  "id": "e5f6g7h8-...",
  "status": "pending",
  "source_type": "upload",
  "source_url": null,
  "original_filename": "video.mp4",
  "video_path": null,
  "transcript": null,
  "error": null,
  "created_at": "2026-03-05T12:00:00.000Z",
  "updated_at": "2026-03-05T12:00:00.000Z"
}
```

### Check job status (upload — after processing)

```bash
curl -s http://localhost:3000/api/jobs/JOB_ID_HERE | jq .
```

**Expected response (200) — upload job, completed ingest:**
```json
{
  "id": "e5f6g7h8-...",
  "status": "queued",
  "source_type": "upload",
  "source_url": null,
  "original_filename": "video.mp4",
  "video_path": "data/uploads/e5f6g7h8-....mp4",
  "error": null,
  "created_at": "2026-03-05T12:00:00.000Z",
  "updated_at": "2026-03-05T12:00:00.100Z"
}
```

### Check job status (YouTube — after download)

```bash
curl -s http://localhost:3000/api/jobs/JOB_ID_HERE | jq .
```

**Expected response (200) — YouTube job, completed download:**
```json
{
  "id": "a1b2c3d4-...",
  "status": "queued",
  "source_type": "youtube",
  "source_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "original_filename": null,
  "video_path": "data/uploads/a1b2c3d4-....mp4",
  "error": null,
  "created_at": "2026-03-05T12:00:00.000Z",
  "updated_at": "2026-03-05T12:00:05.000Z"
}
```

### Check job status (failed — duration exceeded)

**Expected response (200) — YouTube video too long:**
```json
{
  "id": "x9y0z1-...",
  "status": "failed",
  "source_type": "youtube",
  "source_url": "https://www.youtube.com/watch?v=LONG_VIDEO",
  "original_filename": null,
  "video_path": null,
  "error": "Video exceeds maximum duration of 3600 seconds",
  "created_at": "2026-03-05T12:00:00.000Z",
  "updated_at": "2026-03-05T12:00:02.000Z"
}
```

### Check job status (after transcription — Phase 2)

```bash
# Poll until status reaches "transcribed"
curl -s http://localhost:3000/api/jobs/JOB_ID_HERE | jq .
```

**Expected response (200) — transcription complete:**
```json
{
  "id": "a1b2c3d4-...",
  "status": "transcribed",
  "source_type": "upload",
  "source_url": null,
  "original_filename": "video.mp4",
  "video_path": "data/uploads/a1b2c3d4-....mp4",
  "error": null,
  "created_at": "2026-03-05T12:00:00.000Z",
  "updated_at": "2026-03-05T12:00:10.000Z"
}
```

The `transcript` field contains the full Whisper API response (verbose JSON with segment-level timestamps). Retrieve it via the API or query SQLite directly:

```bash
sqlite3 data/db.sqlite "SELECT transcript FROM jobs WHERE id = 'JOB_ID_HERE';" | jq .
```

### Status transitions

| Status | Meaning |
|---|---|
| `pending` | Job created, waiting in queue |
| `downloading` | YouTube video being downloaded via yt-dlp |
| `queued` | Video ingested, starting transcription |
| `transcribing` | Audio extracted, Whisper API in progress |
| `transcribed` | Transcript stored, ready for analysis (Phase 3) |
| `failed` | Something went wrong — check `error` field |

---

## Project Structure

```
web/           → Next.js application
  src/
    app/       → Pages + API routes
    lib/       → Database, queue, pipeline modules
data/          → Runtime data (uploads, clips, SQLite DB) — gitignored
```
