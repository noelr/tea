import {
  addMessage, getRecentMessages,
  getAllWorkingOn, getAllReminders, getAllNotes,
  deleteWorkingOn, deleteReminder, deleteNote,
  updateReminder,
} from "./db";
import { processMessage } from "./classifier";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

const port = process.env.PORT || 3000;

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Serve index.html
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = await Bun.file("public/index.html").text();
      return new Response(html, {
        headers: { "Content-Type": "text/html", ...corsHeaders },
      });
    }

    // Chat endpoint
    if (url.pathname === "/api/chat" && req.method === "POST") {
      try {
        const { message } = await req.json() as { message: string };
        if (!message || typeof message !== "string") {
          return Response.json({ error: "Message is required" }, { status: 400, headers: corsHeaders });
        }

        // Store user message
        addMessage("user", message);

        // Build conversation history from recent messages
        const recentMessages = getRecentMessages(30).reverse();
        const history: MessageParam[] = recentMessages.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        // Process with LLM
        const result = await processMessage(history);

        // Store assistant response
        addMessage("assistant", result.response);

        return Response.json({
          response: result.response,
          toolCalls: result.toolCalls,
        }, { headers: corsHeaders });
      } catch (error) {
        console.error("Chat error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return Response.json({ error: message }, { status: 500, headers: corsHeaders });
      }
    }

    // Get all entries for sidebar
    if (url.pathname === "/api/entries" && req.method === "GET") {
      return Response.json({
        workingOn: getAllWorkingOn(),
        reminders: getAllReminders(),
        notes: getAllNotes(),
      }, { headers: corsHeaders });
    }

    // Get chat history
    if (url.pathname === "/api/messages" && req.method === "GET") {
      const messages = getRecentMessages(50).reverse();
      return Response.json(messages, { headers: corsHeaders });
    }

    // Delete working_on entry
    const workingOnMatch = url.pathname.match(/^\/api\/working_on\/(\d+)$/);
    if (workingOnMatch && req.method === "DELETE") {
      const deleted = deleteWorkingOn(Number(workingOnMatch[1]));
      return Response.json({ ok: deleted }, { headers: corsHeaders });
    }

    // Delete reminder
    const reminderDeleteMatch = url.pathname.match(/^\/api\/reminders\/(\d+)$/);
    if (reminderDeleteMatch && req.method === "DELETE") {
      const deleted = deleteReminder(Number(reminderDeleteMatch[1]));
      return Response.json({ ok: deleted }, { headers: corsHeaders });
    }

    // Toggle reminder done
    const reminderPatchMatch = url.pathname.match(/^\/api\/reminders\/(\d+)$/);
    if (reminderPatchMatch && req.method === "PATCH") {
      const { done } = await req.json() as { done: boolean };
      const updated = updateReminder(Number(reminderPatchMatch[1]), undefined, done ? 1 : 0);
      return Response.json({ ok: !!updated, entry: updated }, { headers: corsHeaders });
    }

    // Delete note
    const noteMatch = url.pathname.match(/^\/api\/notes\/(\d+)$/);
    if (noteMatch && req.method === "DELETE") {
      const deleted = deleteNote(Number(noteMatch[1]));
      return Response.json({ ok: deleted }, { headers: corsHeaders });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
});

console.log(`Work Journal running at http://localhost:${server.port}`);
