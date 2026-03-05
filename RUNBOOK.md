# Runbook — Video to Clips MVP

## Prerequisites

- **Node.js** ≥ 20
- **npm** ≥ 10
- **ffmpeg** (system binary)
- **yt-dlp** (system binary, for YouTube downloads)

Or just use **Docker** (includes everything).

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

### Check job status

```bash
curl -s http://localhost:3000/api/jobs/JOB_ID_HERE | jq .
```

**Expected response (200):**
```json
{
  "id": "a1b2c3d4-...",
  "status": "queued",
  "source_type": "youtube",
  "source_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "original_filename": null,
  "video_path": "/app/data/uploads/a1b2c3d4-....mp4",
  "error": null,
  "created_at": "2026-03-05T12:00:00.000Z",
  "updated_at": "2026-03-05T12:00:05.000Z"
}
```

### Status transitions (Phase 1)

| Status | Meaning |
|---|---|
| `pending` | Job created, waiting in queue |
| `downloading` | Video being downloaded (YouTube) or saved (upload) |
| `queued` | Video ingested, ready for transcription (Phase 3) |
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
