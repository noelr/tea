import Anthropic from "@anthropic-ai/sdk";
import type { Tool, MessageParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import {
  createWorkingOn, updateWorkingOn, deleteWorkingOn, getAllWorkingOn,
  createReminder, updateReminder, deleteReminder, getAllReminders,
  createNote, updateNote, deleteNote, getAllNotes,
} from "./db";

const client = new Anthropic();

const tools: Tool[] = [
  {
    name: "working_on",
    description: "Log what the user is currently working on. Use when the user mentions starting work on a project, switching tasks, or stopping work on something. Each entry tracks a project/task and when it was started.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["create", "update", "delete"], description: "create: start tracking a new project. update: change an existing entry. delete: remove an entry." },
        id: { type: "number", description: "ID of entry to update or delete. Required for update/delete." },
        project: { type: "string", description: "Name or description of what the user is working on. Required for create/update." },
      },
      required: ["action"],
    },
  },
  {
    name: "reminder",
    description: "Manage the user's todo list / reminders. Use when the user mentions something they need to do, a follow-up task, a call they need to make, something for tomorrow, etc. Also use to mark items as done or update them.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["create", "update", "delete"], description: "create: add a new reminder. update: modify content or mark as done/undone. delete: remove a reminder." },
        id: { type: "number", description: "ID of reminder to update or delete. Required for update/delete." },
        content: { type: "string", description: "The reminder text. Required for create, optional for update." },
        done: { type: "boolean", description: "Mark reminder as done (true) or not done (false). Only for update." },
      },
      required: ["action"],
    },
  },
  {
    name: "note",
    description: "Log a note, observation, or piece of information. Use for general thoughts, learnings, things the user figured out, status updates, things they fixed, discovered, or want to remember. Anything that isn't a task/todo or a project switch.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["create", "update", "delete"], description: "create: add a new note. update: modify an existing note. delete: remove a note." },
        id: { type: "number", description: "ID of note to update or delete. Required for update/delete." },
        content: { type: "string", description: "The note text. Required for create/update." },
      },
      required: ["action"],
    },
  },
];

function executeTool(name: string, input: Record<string, unknown>): string {
  const action = input.action as string;

  switch (name) {
    case "working_on": {
      if (action === "create") {
        const entry = createWorkingOn(input.project as string);
        return JSON.stringify({ ok: true, entry });
      } else if (action === "update") {
        const entry = updateWorkingOn(input.id as number, input.project as string);
        return entry ? JSON.stringify({ ok: true, entry }) : JSON.stringify({ ok: false, error: "Not found" });
      } else if (action === "delete") {
        const deleted = deleteWorkingOn(input.id as number);
        return JSON.stringify({ ok: deleted, error: deleted ? undefined : "Not found" });
      }
      return JSON.stringify({ ok: false, error: "Unknown action" });
    }
    case "reminder": {
      if (action === "create") {
        const entry = createReminder(input.content as string);
        return JSON.stringify({ ok: true, entry });
      } else if (action === "update") {
        const done = input.done !== undefined ? (input.done ? 1 : 0) : undefined;
        const entry = updateReminder(input.id as number, input.content as string | undefined, done);
        return entry ? JSON.stringify({ ok: true, entry }) : JSON.stringify({ ok: false, error: "Not found" });
      } else if (action === "delete") {
        const deleted = deleteReminder(input.id as number);
        return JSON.stringify({ ok: deleted, error: deleted ? undefined : "Not found" });
      }
      return JSON.stringify({ ok: false, error: "Unknown action" });
    }
    case "note": {
      if (action === "create") {
        const entry = createNote(input.content as string);
        return JSON.stringify({ ok: true, entry });
      } else if (action === "update") {
        const entry = updateNote(input.id as number, input.content as string);
        return entry ? JSON.stringify({ ok: true, entry }) : JSON.stringify({ ok: false, error: "Not found" });
      } else if (action === "delete") {
        const deleted = deleteNote(input.id as number);
        return JSON.stringify({ ok: deleted, error: deleted ? undefined : "Not found" });
      }
      return JSON.stringify({ ok: false, error: "Unknown action" });
    }
    default:
      return JSON.stringify({ ok: false, error: "Unknown tool" });
  }
}

function buildSystemPrompt(): string {
  const workingOn = getAllWorkingOn();
  const reminders = getAllReminders();
  const notes = getAllNotes();
  const now = new Date().toISOString();

  let context = `You are a work journal assistant. You help the user log their daily work sessions.

Current date/time: ${now}

You have 3 tools:

1. **working_on** - Track what the user is working on (projects, tasks). Use when they say things like "working on X now", "switching to Y", "starting Z".
2. **reminder** - A todo/reminder list. Use when the user mentions things they need to do, follow-ups, calls to make, things for later. You can also mark items as done.
3. **note** - Log observations, learnings, fixes, discoveries, status updates, or anything that's not a task or project switch.

You can call multiple tools in a single response if the user's message contains multiple items.
When the user mentions something actionable, use the appropriate tool(s) AND respond conversationally.
Keep responses short and natural. Don't be overly formal.
If the user asks to update or delete something, look at the current entries below to find the right ID.
If the user just wants to chat or ask a question without logging anything, just respond normally without using tools.

User messages include timestamps in the format [YYYY-MM-DD HH:MM:SS]. Use these to answer questions about what happened on specific days (e.g., "what did I work on yesterday?").`;

  if (workingOn.length > 0) {
    context += `\n\nCurrent "Working On" entries:\n${workingOn.map(w => `  [id:${w.id}] ${w.project} (since ${w.started_at})`).join("\n")}`;
  }
  if (reminders.length > 0) {
    context += `\n\nCurrent reminders:\n${reminders.map(r => `  [id:${r.id}] ${r.done ? "[DONE]" : "[TODO]"} ${r.content} (${r.created_at})`).join("\n")}`;
  }
  if (notes.length > 0) {
    context += `\n\nRecent notes:\n${notes.slice(0, 20).map(n => `  [id:${n.id}] ${n.content} (${n.created_at})`).join("\n")}`;
  }

  return context;
}

export async function processMessage(
  conversationHistory: MessageParam[]
): Promise<{ response: string; toolCalls: { tool: string; action: string; summary: string }[] }> {
  const systemPrompt = buildSystemPrompt();
  const toolCalls: { tool: string; action: string; summary: string }[] = [];

  let messages = [...conversationHistory];

  // Agentic loop: keep calling the model until it stops using tools
  while (true) {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    });

    // If no tool use, extract text and return
    if (response.stop_reason === "end_turn" || !response.content.some(b => b.type === "tool_use")) {
      const textBlocks = response.content.filter(b => b.type === "text");
      const text = textBlocks.map(b => b.type === "text" ? b.text : "").join("");
      return { response: text || "Got it.", toolCalls };
    }

    // Process tool calls
    const toolResults: ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === "tool_use") {
        const result = executeTool(block.name, block.input as Record<string, unknown>);
        const input = block.input as Record<string, unknown>;
        toolCalls.push({
          tool: block.name,
          action: input.action as string,
          summary: (input.project || input.content || `id:${input.id}`) as string,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }
    }

    // Add assistant response and tool results to messages for next iteration
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }
}
