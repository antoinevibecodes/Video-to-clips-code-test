import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.resolve(process.cwd(), "..", "data");
const DB_PATH = path.join(DATA_DIR, "db.sqlite");

// Ensure data directory exists
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "uploads"), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "clips"), { recursive: true });

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Create tables
  _db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      source_type TEXT NOT NULL,
      source_url TEXT,
      original_filename TEXT,
      video_path TEXT,
      transcript TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clips (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      clip_index INTEGER NOT NULL,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      duration REAL NOT NULL,
      title TEXT,
      caption TEXT,
      hashtags TEXT,
      clip_path TEXT,
      subtitle_path TEXT,
      score REAL,
      created_at TEXT NOT NULL
    );
  `);

  return _db;
}

// ── Job helpers ──

export interface Job {
  id: string;
  status: string;
  source_type: string;
  source_url: string | null;
  original_filename: string | null;
  video_path: string | null;
  transcript: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export function createJob(job: {
  id: string;
  source_type: "upload" | "youtube";
  source_url?: string;
  original_filename?: string;
}): Job {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO jobs (id, status, source_type, source_url, original_filename, created_at, updated_at)
     VALUES (?, 'pending', ?, ?, ?, ?, ?)`
  ).run(
    job.id,
    job.source_type,
    job.source_url ?? null,
    job.original_filename ?? null,
    now,
    now
  );
  return getJob(job.id)!;
}

export function getJob(id: string): Job | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as
    | Job
    | undefined;
}

export function updateJobStatus(
  id: string,
  status: string,
  extra?: Partial<Pick<Job, "video_path" | "error">>
): void {
  const db = getDb();
  const now = new Date().toISOString();
  if (extra?.video_path !== undefined) {
    db.prepare(
      "UPDATE jobs SET status = ?, video_path = ?, updated_at = ? WHERE id = ?"
    ).run(status, extra.video_path, now, id);
  } else if (extra?.error !== undefined) {
    db.prepare(
      "UPDATE jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?"
    ).run(status, extra.error, now, id);
  } else {
    db.prepare("UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?").run(
      status,
      now,
      id
    );
  }
}

export function updateJobTranscript(id: string, transcript: object): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE jobs SET status = 'transcribed', transcript = ?, updated_at = ? WHERE id = ?"
  ).run(JSON.stringify(transcript), now, id);
}

export function insertClips(
  jobId: string,
  clips: Array<{
    id: string;
    job_id: string;
    clip_index: number;
    start_time: number;
    end_time: number;
    duration: number;
    score: number;
    rationale: string;
  }>
): void {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO clips (id, job_id, clip_index, start_time, end_time, duration, score, caption, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertAll = db.transaction(() => {
    for (const c of clips) {
      stmt.run(c.id, c.job_id, c.clip_index, c.start_time, c.end_time, c.duration, c.score, c.rationale, now);
    }
    // Mark job as analyzed
    db.prepare("UPDATE jobs SET status = 'analyzed', updated_at = ? WHERE id = ?").run(now, jobId);
  });

  insertAll();
}

export interface Clip {
  id: string;
  job_id: string;
  clip_index: number;
  start_time: number;
  end_time: number;
  duration: number;
  title: string | null;
  caption: string | null;
  hashtags: string | null;
  clip_path: string | null;
  subtitle_path: string | null;
  score: number | null;
  created_at: string;
}

export function getClipsByJobId(jobId: string): Clip[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM clips WHERE job_id = ? ORDER BY clip_index")
    .all(jobId) as Clip[];
}

export function updateClipPaths(
  clipId: string,
  clipPath: string,
  subtitlePath: string | null
): void {
  const db = getDb();
  db.prepare(
    "UPDATE clips SET clip_path = ?, subtitle_path = ? WHERE id = ?"
  ).run(clipPath, subtitlePath, clipId);
}

export function updateClipMetadata(
  clipId: string,
  title: string,
  caption: string,
  hashtags: string
): void {
  const db = getDb();
  db.prepare(
    "UPDATE clips SET title = ?, caption = ?, hashtags = ? WHERE id = ?"
  ).run(title, caption, hashtags, clipId);
}
