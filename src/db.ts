import { Database } from "bun:sqlite";

const db = new Database("thoughts.db");

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

export function getAllTags(): string[] {
  const result = db
    .prepare("SELECT DISTINCT name FROM tags ORDER BY name")
    .all() as { name: string }[];
  return result.map((r) => r.name);
}

export function getThoughtsByTag(tagName: string): ThoughtWithClassifications[] {
  const thoughts = db.prepare(`
    SELECT DISTINCT t.* FROM thoughts t
    JOIN tags ON tags.thought_id = t.id
    WHERE tags.name = ?
    ORDER BY t.created_at DESC
  `).all(tagName) as Thought[];

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

export function getAllActions(): string[] {
  const result = db
    .prepare("SELECT description FROM classifications WHERE type = 'action' ORDER BY id DESC")
    .all() as { description: string }[];
  return result.map((r) => r.description);
}

export default db;
