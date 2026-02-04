import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface ReviewResult {
  summary: string;
  events: Array<{ description: string; thoughtIds: number[] }>;
  actions: Array<{ description: string; thoughtIds: number[] }>;
  entities: string[];
}

export interface ClassifierContext {
  existingEntities: string[];
  openActions: string[];
}

export interface ThoughtEntry {
  id: number;
  content: string;
  created_at: string;
}

// Store conversation history for chat
let conversationHistory: Anthropic.MessageParam[] = [];
let currentReviewData: {
  thoughts: ThoughtEntry[];
  context: ClassifierContext;
} | null = null;

export function startReview(thoughts: ThoughtEntry[], context: ClassifierContext): void {
  currentReviewData = { thoughts, context };
  conversationHistory = [];
}

export function clearReview(): void {
  currentReviewData = null;
  conversationHistory = [];
}

export async function processReview(): Promise<ReviewResult> {
  if (!currentReviewData) {
    throw new Error("No review started");
  }

  const { thoughts, context } = currentReviewData;

  const thoughtsText = thoughts
    .map((t, i) => `[${i + 1}] (ID: ${t.id}) "${t.content}" - ${t.created_at}`)
    .join("\n");

  const entitiesContext = context.existingEntities.length > 0
    ? `\n\nExisting entities in the system: ${context.existingEntities.join(", ")}\nNormalize any misspellings to existing entities when possible.`
    : "";

  const actionsContext = context.openActions.length > 0
    ? `\n\nOpen actions (not yet completed):\n${context.openActions.map((a, i) => `${i + 1}. ${a}`).join("\n")}\nNote if any events appear to complete these actions.`
    : "";

  const systemPrompt = `You are a thought review assistant. The user has captured several thoughts/notes and wants you to analyze them.

Your job is to:
1. Provide a brief summary of what happened
2. Extract events (things that happened)
3. Extract actions (tasks with measurable outcomes - only include if there's a concrete deliverable)
4. Extract entities (people, projects, tools) as tags${entitiesContext}${actionsContext}

Always respond with valid JSON in this format:
{
  "summary": "Brief summary of the entries",
  "events": [{"description": "event description", "thoughtIds": [1, 2]}],
  "actions": [{"description": "action with measurable outcome", "thoughtIds": [3]}],
  "entities": ["Entity1", "Entity2"]
}

The thoughtIds should reference the IDs provided in the input.`;

  const userMessage = `Please review these thought entries:\n\n${thoughtsText}`;

  conversationHistory = [{ role: "user", content: userMessage }];

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: systemPrompt,
    messages: conversationHistory,
  });

  const responseText = message.content[0].type === "text" ? message.content[0].text : "";
  conversationHistory.push({ role: "assistant", content: responseText });

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    return JSON.parse(jsonMatch[0]) as ReviewResult;
  } catch (error) {
    console.error("Failed to parse review response:", responseText);
    return {
      summary: "Failed to parse review",
      events: [],
      actions: [],
      entities: [],
    };
  }
}

export async function chatWithReview(userMessage: string): Promise<ReviewResult> {
  if (!currentReviewData) {
    throw new Error("No review started");
  }

  const { context } = currentReviewData;

  const entitiesContext = context.existingEntities.length > 0
    ? `\n\nExisting entities: ${context.existingEntities.join(", ")}`
    : "";

  const actionsContext = context.openActions.length > 0
    ? `\n\nOpen actions:\n${context.openActions.map((a, i) => `${i + 1}. ${a}`).join("\n")}`
    : "";

  const systemPrompt = `You are a thought review assistant helping refine the analysis of captured thoughts.${entitiesContext}${actionsContext}

The user may ask you to:
- Add or remove events/actions
- Rename entities
- Change categorizations
- Clarify relationships

Always respond with the updated JSON in this format:
{
  "summary": "Brief summary of the entries",
  "events": [{"description": "event description", "thoughtIds": [1, 2]}],
  "actions": [{"description": "action with measurable outcome", "thoughtIds": [3]}],
  "entities": ["Entity1", "Entity2"]
}`;

  conversationHistory.push({ role: "user", content: userMessage });

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: systemPrompt,
    messages: conversationHistory,
  });

  const responseText = message.content[0].type === "text" ? message.content[0].text : "";
  conversationHistory.push({ role: "assistant", content: responseText });

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    return JSON.parse(jsonMatch[0]) as ReviewResult;
  } catch (error) {
    console.error("Failed to parse chat response:", responseText);
    throw new Error("Failed to parse response. Please try again.");
  }
}
