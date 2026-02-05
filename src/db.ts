import { Database } from "bun:sqlite";

const db = new Database("thoughts.db");

db.run(`
  CREATE TABLE IF NOT EXISTS thoughts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export interface Thought {
  id: number;
  content: string;
  created_at: string;
}

export function createThought(content: string): Thought {
  const stmt = db.prepare("INSERT INTO thoughts (content) VALUES (?) RETURNING *");
  return stmt.get(content) as Thought;
}

export function getAllThoughts(): Thought[] {
  return db.prepare("SELECT * FROM thoughts ORDER BY created_at DESC").all() as Thought[];
}

export default db;
