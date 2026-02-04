import { Database } from "bun:sqlite";

const db = new Database("thoughts.db");

// Initialize the database schema
db.run(`
  CREATE TABLE IF NOT EXISTS thoughts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS classifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thought_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('event', 'action')),
    description TEXT NOT NULL,
    FOREIGN KEY (thought_id) REFERENCES thoughts(id) ON DELETE CASCADE
  )
`);

export interface Thought {
  id: number;
  content: string;
  created_at: string;
}

export interface Classification {
  id: number;
  thought_id: number;
  type: "event" | "action";
  description: string;
}

export interface ThoughtWithClassifications extends Thought {
  classifications: Classification[];
}

export function createThought(content: string): Thought {
  const stmt = db.prepare("INSERT INTO thoughts (content) VALUES (?) RETURNING *");
  return stmt.get(content) as Thought;
}

export function addClassification(
  thoughtId: number,
  type: Classification["type"],
  description: string
): Classification {
  const stmt = db.prepare(
    "INSERT INTO classifications (thought_id, type, description) VALUES (?, ?, ?) RETURNING *"
  );
  return stmt.get(thoughtId, type, description) as Classification;
}

export function getAllThoughts(): ThoughtWithClassifications[] {
  const thoughts = db.prepare("SELECT * FROM thoughts ORDER BY created_at DESC").all() as Thought[];

  return thoughts.map((thought) => {
    const classifications = db
      .prepare("SELECT * FROM classifications WHERE thought_id = ?")
      .all(thought.id) as Classification[];
    return { ...thought, classifications };
  });
}

export function getThoughtById(id: number): ThoughtWithClassifications | null {
  const thought = db.prepare("SELECT * FROM thoughts WHERE id = ?").get(id) as Thought | null;
  if (!thought) return null;

  const classifications = db
    .prepare("SELECT * FROM classifications WHERE thought_id = ?")
    .all(id) as Classification[];

  return { ...thought, classifications };
}

export default db;
