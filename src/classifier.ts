import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface ClassificationResult {
  events: string[];
  actions: string[];
  entities: string[];
}

export interface ClassifierContext {
  existingEntities: string[];
  openActions: string[];
}

export async function classifyThought(
  thought: string,
  context: ClassifierContext
): Promise<ClassificationResult> {
  const entitiesContext = context.existingEntities.length > 0
    ? `\n\nExisting entities in the system: ${context.existingEntities.join(", ")}\nNormalize any misspellings to existing entities when possible.`
    : "";

  const actionsContext = context.openActions.length > 0
    ? `\n\nOpen actions (not yet completed):\n${context.openActions.map((a, i) => `${i + 1}. ${a}`).join("\n")}\nNote if any events appear to complete these actions.`
    : "";

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Analyze this thought and extract events, actions, and entities.

- **Events**: Things that happened (e.g., "Brigitte called", "meeting was held")
- **Actions**: Tasks with measurable outcomes only (e.g., "create export for EDAVis"). Must have concrete deliverable.
- **Entities**: People, projects, tools as short tags (e.g., "Brigitte", "EDAVis")${entitiesContext}${actionsContext}

Respond with JSON only:
{"events": [], "actions": [], "entities": []}

Thought: "${thought}"`,
      },
    ],
  });

  const responseText = message.content[0].type === "text" ? message.content[0].text : "";

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found");
    }
    const result = JSON.parse(jsonMatch[0]) as ClassificationResult;
    return {
      events: result.events || [],
      actions: result.actions || [],
      entities: result.entities || [],
    };
  } catch (error) {
    console.error("Failed to parse:", responseText);
    return { events: [], actions: [], entities: [] };
  }
}
