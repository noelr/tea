import { createThought, getAllThoughts, type Thought } from "./db";

interface GroupedThoughts {
  today: Thought[];
  yesterday: Thought[];
  thisWeek: Thought[];
  thisMonth: Thought[];
  older: Thought[];
}

function groupThoughtsByTime(thoughts: Thought[]): GroupedThoughts {
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

    if (url.pathname === "/api/thoughts" && req.method === "GET") {
      const thoughts = getAllThoughts();
      const grouped = groupThoughtsByTime(thoughts);
      return Response.json(grouped, { headers: corsHeaders });
    }

    if (url.pathname === "/api/thoughts" && req.method === "POST") {
      try {
        const body = await req.json();
        const { content } = body as { content: string };

        if (!content || typeof content !== "string") {
          return Response.json({ error: "Content is required" }, { status: 400, headers: corsHeaders });
        }

        const thought = createThought(content);
        return Response.json(thought, { status: 201, headers: corsHeaders });
      } catch (error) {
        console.error("Error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return Response.json({ error: message }, { status: 500, headers: corsHeaders });
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
});

console.log(`🧠 Thought Capture running at http://localhost:${server.port}`);
