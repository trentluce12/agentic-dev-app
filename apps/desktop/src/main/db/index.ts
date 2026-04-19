import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { app } from 'electron';
import * as schema from './schema.ts';

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>> & {
  close: () => void;
  raw: Database.Database;
};

export function initDatabase(): AppDatabase {
  const userDataPath = app.getPath('userData');
  mkdirSync(userDataPath, { recursive: true });
  const dbPath = join(userDataPath, 'app.db');

  const raw = new Database(dbPath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');

  runMigrations(raw);

  const db = drizzle(raw, { schema }) as AppDatabase;
  db.close = () => raw.close();
  db.raw = raw;
  return db;
}

/**
 * Minimal inline migration runner. Before shipping, switch to drizzle-kit
 * migrations (`pnpm drizzle-kit generate` + migrate via migrator) once the
 * schema stabilises.
 */
function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      claude_session_id TEXT,
      project_path TEXT NOT NULL,
      status TEXT NOT NULL,
      linked_ticket_id TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch() * 1000)
    );
    CREATE TABLE IF NOT EXISTS session_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      kind TEXT NOT NULL,
      agent_id TEXT,
      parent_agent_id TEXT,
      tool_name TEXT,
      payload_json TEXT
    );
    CREATE INDEX IF NOT EXISTS session_events_session_idx ON session_events(session_id, ts);
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body_md TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium',
      sprint_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE TABLE IF NOT EXISTS sprints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      goal TEXT,
      start_at INTEGER NOT NULL,
      end_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ticket_sessions (
      ticket_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      linked_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY (ticket_id, session_id)
    );
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      graph_json TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      session_id TEXT,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      ended_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recent_projects (
      path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      opened_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);
}

export { schema };
