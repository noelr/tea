import {
  createThought,
  addClassification,
  addTag,
  getAllThoughts,
  getAllTags,
  getAllActions,
  getThoughtsByTag,
  type ThoughtWithClassifications,
  type Classification,
  type Tag,
} from "./db";
import { classifyThought } from "./classifier";

interface GroupedThoughts {
  today: ThoughtWithClassifications[];
  yesterday: ThoughtWithClassifications[];
  thisWeek: ThoughtWithClassifications[];
  thisMonth: ThoughtWithClassifications[];
  older: ThoughtWithClassifications[];
}

function groupThoughtsByTime(thoughts: ThoughtWithClassifications[]): GroupedThoughts {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const grouped: GroupedThoughts = {
    today: [],
    yesterday: [],
    thisWeek: [],
    thisMonth: [],
    older: [],
  };

  for (const thought of thoughts) {
    const createdAt = new Date(thought.created_at + "Z");

    if (createdAt >= today) {
      grouped.today.push(thought);
    } else if (createdAt >= yesterday) {
      grouped.yesterday.push(thought);
    } else if (createdAt >= weekAgo) {
      grouped.thisWeek.push(thought);
    } else if (createdAt >= monthAgo) {
      grouped.thisMonth.push(thought);
    } else {
      grouped.older.push(thought);
    }
  }

  return grouped;
}

const port = process.env.PORT || 3000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("⚠️  WARNING: ANTHROPIC_API_KEY is not set.");
}

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = await Bun.file("public/index.html").text();
      return new Response(html, {
        headers: { "Content-Type": "text/html", ...corsHeaders },
      });
    }

    // Get all thoughts grouped by time
    if (url.pathname === "/api/thoughts" && req.method === "GET") {
      const thoughts = getAllThoughts();
      const grouped = groupThoughtsByTime(thoughts);
      return Response.json(grouped, { headers: corsHeaders });
    }

    // Create and classify a thought
    if (url.pathname === "/api/thoughts" && req.method === "POST") {
      try {
        const body = await req.json();
        const { content } = body as { content: string };

        if (!content || typeof content !== "string") {
          return Response.json({ error: "Content is required" }, { status: 400, headers: corsHeaders });
        }

        const thought = createThought(content);

        // Get context and classify
        const existingEntities = getAllTags();
        const openActions = getAllActions();
        const classifications = await classifyThought(content, { existingEntities, openActions });

        // Store
        const storedClassifications: Classification[] = [];
        for (const event of classifications.events) {
          storedClassifications.push(addClassification(thought.id, "event", event));
        }
        for (const action of classifications.actions) {
          storedClassifications.push(addClassification(thought.id, "action", action));
        }

        const storedTags: Tag[] = [];
        for (const entity of classifications.entities) {
          storedTags.push(addTag(thought.id, entity));
        }

        return Response.json(
          { ...thought, classifications: storedClassifications, tags: storedTags },
          { status: 201, headers: corsHeaders }
        );
      } catch (error) {
        console.error("Error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return Response.json({ error: message }, { status: 500, headers: corsHeaders });
      }
    }

    // Get all tags
    if (url.pathname === "/api/tags" && req.method === "GET") {
      const tags = getAllTags();
      return Response.json(tags, { headers: corsHeaders });
    }

    // Get thoughts by tag
    const tagMatch = url.pathname.match(/^\/api\/tags\/(.+)$/);
    if (tagMatch && req.method === "GET") {
      const tagName = decodeURIComponent(tagMatch[1]);
      const thoughts = getThoughtsByTag(tagName);
      return Response.json(thoughts, { headers: corsHeaders });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
});

console.log(`🧠 Thought Capture running at http://localhost:${server.port}`);
