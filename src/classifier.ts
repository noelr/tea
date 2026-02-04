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
    ? `\n\n**Existing entities in the system:** ${context.existingEntities.join(", ")}\nWhen you detect an entity, check if it matches or is a misspelling of an existing entity. If so, use the existing entity name exactly. Only create new entity names if they are clearly different from all existing ones.`
    : "";

  const actionsContext = context.openActions.length > 0
    ? `\n\n**Open actions (not yet completed):**\n${context.openActions.map((a, i) => `${i + 1}. ${a}`).join("\n")}\nWhen extracting events, consider whether they might indicate completion of any open action. For example, "sent the report to John" would relate to an open action "send report to John". Note any such relationships in the event description.`
    : "";

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Analyze the following thought/note and extract events, actions, and entities from it.

- **Events**: Things that happened or are happening (e.g., "Brigitte called", "meeting was held"). If an event appears to complete an open action, mention this relationship.
- **Actions**: Tasks with a clear, measurable outcome (e.g., "create a new export for EDAVis", "send report to client"). Only include actions that have a concrete deliverable or verifiable completion state. Do NOT include vague intentions or ideas.
- **Entities**: People, projects, tools, companies, or other named things mentioned (e.g., "Brigitte", "EDAVis", "Acme Corp"). Use short, normalized names suitable as tags.${entitiesContext}${actionsContext}

Respond in JSON format only, with no additional text:
{
  "events": ["description of event 1", "description of event 2"],
  "actions": ["description of action 1", "description of action 2"],
  "entities": ["entity1", "entity2"]
}

If a category has no items, use an empty array.

Thought to analyze:
"${thought}"`,
      },
    ],
  });

  const responseText = message.content[0].type === "text" ? message.content[0].text : "";

  try {
    // Extract JSON from the response (in case there's extra text)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    const result = JSON.parse(jsonMatch[0]) as ClassificationResult;
    return {
      events: result.events || [],
      actions: result.actions || [],
      entities: result.entities || [],
    };
  } catch (error) {
    console.error("Failed to parse classification response:", responseText);
    return { events: [], actions: [], entities: [] };
  }
}
