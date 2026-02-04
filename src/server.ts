import {
  createThought,
  addClassification,
  addTag,
  getUnreviewedThoughts,
  getReviewedThoughts,
  markThoughtsReviewed,
  getAllTags,
  getAllActions,
  getThoughtsByTag,
  type ThoughtWithClassifications,
  type Classification,
  type Tag,
  type Thought,
} from "./db";
import {
  startReview,
  processReview,
  chatWithReview,
  clearReview,
  type ReviewResult,
} from "./classifier";

// Group thoughts by time period
interface GroupedThoughts {
  new: Thought[];
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
  console.warn("⚠️  WARNING: ANTHROPIC_API_KEY is not set. Review will fail.");
}

// Store current review state
let currentReviewResult: ReviewResult | null = null;
let currentReviewThoughts: Thought[] = [];

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

    // Serve the frontend
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = await Bun.file("public/index.html").text();
      return new Response(html, {
        headers: { "Content-Type": "text/html", ...corsHeaders },
      });
    }

    // API: Get all thoughts grouped by time (with unreviewed in "new")
    if (url.pathname === "/api/thoughts" && req.method === "GET") {
      const reviewed = getReviewedThoughts();
      const unreviewed = getUnreviewedThoughts();
      const grouped = groupThoughtsByTime(reviewed);
      grouped.new = unreviewed;
      return Response.json(grouped, { headers: corsHeaders });
    }

    // API: Create a new thought entry (just stores, no AI)
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
        console.error("Error creating thought:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return Response.json(
          { error: `Failed to create thought: ${message}` },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // API: Start review of unreviewed entries
    if (url.pathname === "/api/review/start" && req.method === "POST") {
      try {
        const unreviewed = getUnreviewedThoughts();
        if (unreviewed.length === 0) {
          return Response.json({ error: "No entries to review" }, { status: 400, headers: corsHeaders });
        }

        const existingEntities = getAllTags();
        const openActions = getAllActions();

        currentReviewThoughts = unreviewed;
        startReview(unreviewed, { existingEntities, openActions });
        const result = await processReview();
        currentReviewResult = result;

        return Response.json({
          thoughts: unreviewed,
          review: result,
        }, { headers: corsHeaders });
      } catch (error) {
        console.error("Error starting review:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return Response.json(
          { error: `Failed to start review: ${message}` },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // API: Chat with review
    if (url.pathname === "/api/review/chat" && req.method === "POST") {
      try {
        const body = await req.json();
        const { message } = body as { message: string };

        if (!message || typeof message !== "string") {
          return Response.json({ error: "Message is required" }, { status: 400, headers: corsHeaders });
        }

        const result = await chatWithReview(message);
        currentReviewResult = result;

        return Response.json({ review: result }, { headers: corsHeaders });
      } catch (error) {
        console.error("Error in review chat:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return Response.json(
          { error: `Chat failed: ${message}` },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // API: Commit review results
    if (url.pathname === "/api/review/commit" && req.method === "POST") {
      try {
        if (!currentReviewResult || currentReviewThoughts.length === 0) {
          return Response.json({ error: "No review to commit" }, { status: 400, headers: corsHeaders });
        }

        const thoughtIds = currentReviewThoughts.map(t => t.id);

        // Add classifications
        for (const event of currentReviewResult.events) {
          for (const thoughtId of event.thoughtIds) {
            if (thoughtIds.includes(thoughtId)) {
              addClassification(thoughtId, "event", event.description);
            }
          }
        }

        for (const action of currentReviewResult.actions) {
          for (const thoughtId of action.thoughtIds) {
            if (thoughtIds.includes(thoughtId)) {
              addClassification(thoughtId, "action", action.description);
            }
          }
        }

        // Add tags to all reviewed thoughts
        for (const entity of currentReviewResult.entities) {
          for (const thoughtId of thoughtIds) {
            addTag(thoughtId, entity);
          }
        }

        // Mark thoughts as reviewed
        markThoughtsReviewed(thoughtIds);

        // Clear review state
        clearReview();
        currentReviewResult = null;
        currentReviewThoughts = [];

        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (error) {
        console.error("Error committing review:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return Response.json(
          { error: `Failed to commit: ${message}` },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // API: Cancel review
    if (url.pathname === "/api/review/cancel" && req.method === "POST") {
      clearReview();
      currentReviewResult = null;
      currentReviewThoughts = [];
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // API: Get all unique tags
    if (url.pathname === "/api/tags" && req.method === "GET") {
      const tags = getAllTags();
      return Response.json(tags, { headers: corsHeaders });
    }

    // API: Get thoughts by tag
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
