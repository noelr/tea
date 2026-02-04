import {
  createThought,
  addClassification,
  getAllThoughts,
  type ThoughtWithClassifications,
  type Classification,
} from "./db";
import { classifyThought } from "./classifier";

// Group thoughts by time period
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
    const createdAt = new Date(thought.created_at + "Z"); // Parse as UTC

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

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Serve the frontend
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = await Bun.file("public/index.html").text();
      return new Response(html, {
        headers: { "Content-Type": "text/html", ...corsHeaders },
      });
    }

    // API: Get all thoughts grouped by time
    if (url.pathname === "/api/thoughts" && req.method === "GET") {
      const thoughts = getAllThoughts();
      const grouped = groupThoughtsByTime(thoughts);
      return Response.json(grouped, { headers: corsHeaders });
    }

    // API: Create a new thought
    if (url.pathname === "/api/thoughts" && req.method === "POST") {
      try {
        const body = await req.json();
        const { content } = body as { content: string };

        if (!content || typeof content !== "string") {
          return Response.json({ error: "Content is required" }, { status: 400, headers: corsHeaders });
        }

        // Create the thought
        const thought = createThought(content);

        // Classify the thought using AI
        const classifications = await classifyThought(content);

        // Store classifications
        const storedClassifications: Classification[] = [];

        for (const idea of classifications.ideas) {
          const c = addClassification(thought.id, "idea", idea);
          storedClassifications.push(c);
        }

        for (const event of classifications.events) {
          const c = addClassification(thought.id, "event", event);
          storedClassifications.push(c);
        }

        for (const action of classifications.actions) {
          const c = addClassification(thought.id, "action", action);
          storedClassifications.push(c);
        }

        return Response.json(
          { ...thought, classifications: storedClassifications },
          { status: 201, headers: corsHeaders }
        );
      } catch (error) {
        console.error("Error creating thought:", error);
        return Response.json(
          { error: "Failed to create thought" },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
});

console.log(`🧠 Thought Capture running at http://localhost:${server.port}`);
