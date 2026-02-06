import { Database } from "bun:sqlite";

// Use /data on Railway (persistent volume), local file otherwise
const dbPath = process.env.RAILWAY_ENVIRONMENT ? "/data/journal.db" : "journal.db";
const db = new Database(dbPath);

db.run(`
  CREATE TABLE IF NOT EXISTS working_on (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    done INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Types
export interface WorkingOn {
  id: number;
  project: string;
  started_at: string;
}

export interface Reminder {
  id: number;
  content: string;
  done: number;
  created_at: string;
}

export interface Note {
  id: number;
  content: string;
  created_at: string;
}

export interface Message {
  id: number;
  role: string;
  content: string;
  created_at: string;
}

// Working On
export function createWorkingOn(project: string): WorkingOn {
  return db.prepare("INSERT INTO working_on (project) VALUES (?) RETURNING *").get(project) as WorkingOn;
}

export function updateWorkingOn(id: number, project: string): WorkingOn | null {
  return db.prepare("UPDATE working_on SET project = ? WHERE id = ? RETURNING *").get(project, id) as WorkingOn | null;
}

export function deleteWorkingOn(id: number): boolean {
  const result = db.prepare("DELETE FROM working_on WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getAllWorkingOn(): WorkingOn[] {
  return db.prepare("SELECT * FROM working_on ORDER BY started_at DESC").all() as WorkingOn[];
}

// Reminders
export function createReminder(content: string): Reminder {
  return db.prepare("INSERT INTO reminders (content) VALUES (?) RETURNING *").get(content) as Reminder;
}

export function updateReminder(id: number, content?: string, done?: number): Reminder | null {
  const current = db.prepare("SELECT * FROM reminders WHERE id = ?").get(id) as Reminder | null;
  if (!current) return null;
  const newContent = content ?? current.content;
  const newDone = done ?? current.done;
  return db.prepare("UPDATE reminders SET content = ?, done = ? WHERE id = ? RETURNING *").get(newContent, newDone, id) as Reminder;
}

export function deleteReminder(id: number): boolean {
  const result = db.prepare("DELETE FROM reminders WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getAllReminders(): Reminder[] {
  return db.prepare("SELECT * FROM reminders ORDER BY done ASC, created_at DESC").all() as Reminder[];
}

// Notes
export function createNote(content: string): Note {
  return db.prepare("INSERT INTO notes (content) VALUES (?) RETURNING *").get(content) as Note;
}

export function updateNote(id: number, content: string): Note | null {
  return db.prepare("UPDATE notes SET content = ? WHERE id = ? RETURNING *").get(content, id) as Note | null;
}

export function deleteNote(id: number): boolean {
  const result = db.prepare("DELETE FROM notes WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getAllNotes(): Note[] {
  return db.prepare("SELECT * FROM notes ORDER BY created_at DESC").all() as Note[];
}

// Messages
export function addMessage(role: string, content: string): Message {
  return db.prepare("INSERT INTO messages (role, content) VALUES (?, ?) RETURNING *").get(role, content) as Message;
}

export function getRecentMessages(limit: number = 50): Message[] {
  return db.prepare("SELECT * FROM messages ORDER BY created_at DESC LIMIT ?").all(limit) as Message[];
}

export default db;
