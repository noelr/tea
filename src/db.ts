import { Database } from "bun:sqlite";

const db = new Database("thoughts.db");

// Initialize the database schema
db.run(`
  CREATE TABLE IF NOT EXISTS thoughts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    reviewed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Add reviewed column if it doesn't exist (migration for existing DBs)
try {
  db.run(`ALTER TABLE thoughts ADD COLUMN reviewed INTEGER DEFAULT 0`);
} catch (e) {
  // Column already exists
}

db.run(`
  CREATE TABLE IF NOT EXISTS classifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thought_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('event', 'action')),
    description TEXT NOT NULL,
    FOREIGN KEY (thought_id) REFERENCES thoughts(id) ON DELETE CASCADE
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thought_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    FOREIGN KEY (thought_id) REFERENCES thoughts(id) ON DELETE CASCADE
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)`);

export interface Thought {
  id: number;
  content: string;
  reviewed: number;
  created_at: string;
}

export interface Classification {
  id: number;
  thought_id: number;
  type: "event" | "action";
  description: string;
}

export interface Tag {
  id: number;
  thought_id: number;
  name: string;
}

export interface ThoughtWithClassifications extends Thought {
  classifications: Classification[];
  tags: Tag[];
}

// Create a new thought entry (just stores, no processing)
export function createThought(content: string): Thought {
  const stmt = db.prepare("INSERT INTO thoughts (content, reviewed) VALUES (?, 0) RETURNING *");
  return stmt.get(content) as Thought;
}

// Get all unreviewed thoughts (newest first)
export function getUnreviewedThoughts(): Thought[] {
  return db.prepare("SELECT * FROM thoughts WHERE reviewed = 0 ORDER BY created_at DESC").all() as Thought[];
}

// Mark thoughts as reviewed
export function markThoughtsReviewed(thoughtIds: number[]): void {
  const stmt = db.prepare("UPDATE thoughts SET reviewed = 1 WHERE id = ?");
  for (const id of thoughtIds) {
    stmt.run(id);
  }
}

// Get reviewed thoughts (with classifications)
export function getReviewedThoughts(): ThoughtWithClassifications[] {
  const thoughts = db.prepare("SELECT * FROM thoughts WHERE reviewed = 1 ORDER BY created_at DESC").all() as Thought[];

  return thoughts.map((thought) => {
    const classifications = db
      .prepare("SELECT * FROM classifications WHERE thought_id = ?")
      .all(thought.id) as Classification[];
    const tags = db
      .prepare("SELECT * FROM tags WHERE thought_id = ?")
      .all(thought.id) as Tag[];
    return { ...thought, classifications, tags };
  });
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

export function addTag(thoughtId: number, name: string): Tag {
  const stmt = db.prepare(
    "INSERT INTO tags (thought_id, name) VALUES (?, ?) RETURNING *"
  );
  return stmt.get(thoughtId, name) as Tag;
}

export function getAllThoughts(): ThoughtWithClassifications[] {
  const thoughts = db.prepare("SELECT * FROM thoughts ORDER BY created_at DESC").all() as Thought[];

  return thoughts.map((thought) => {
    const classifications = db
      .prepare("SELECT * FROM classifications WHERE thought_id = ?")
      .all(thought.id) as Classification[];
    const tags = db
      .prepare("SELECT * FROM tags WHERE thought_id = ?")
      .all(thought.id) as Tag[];
    return { ...thought, classifications, tags };
  });
}

export function getThoughtById(id: number): ThoughtWithClassifications | null {
  const thought = db.prepare("SELECT * FROM thoughts WHERE id = ?").get(id) as Thought | null;
  if (!thought) return null;

  const classifications = db
    .prepare("SELECT * FROM classifications WHERE thought_id = ?")
    .all(id) as Classification[];
  const tags = db
    .prepare("SELECT * FROM tags WHERE thought_id = ?")
    .all(id) as Tag[];

  return { ...thought, classifications, tags };
}

export function getAllTags(): string[] {
  const result = db
    .prepare("SELECT DISTINCT name FROM tags ORDER BY name")
    .all() as { name: string }[];
  return result.map((r) => r.name);
}

export function getThoughtsByTag(tagName: string): ThoughtWithClassifications[] {
  const thoughtIds = db
    .prepare("SELECT DISTINCT thought_id FROM tags WHERE name = ?")
    .all(tagName) as { thought_id: number }[];

  return thoughtIds.map((row) => getThoughtById(row.thought_id)!).filter(Boolean);
}

export function getAllActions(): string[] {
  const result = db
    .prepare("SELECT description FROM classifications WHERE type = 'action' ORDER BY id DESC")
    .all() as { description: string }[];
  return result.map((r) => r.description);
}

export default db;
