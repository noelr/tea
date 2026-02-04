import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface ClassificationResult {
  events: string[];
  actions: string[];
}

export async function classifyThought(thought: string): Promise<ClassificationResult> {
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Analyze the following thought/note and extract events and actions from it.

- **Events**: Things that happened or are happening (e.g., "Brigitte called", "meeting was held")
- **Actions**: Tasks with a clear, measurable outcome (e.g., "create a new export for EDAVis", "send report to client"). Only include actions that have a concrete deliverable or verifiable completion state. Do NOT include vague intentions or ideas.

Respond in JSON format only, with no additional text:
{
  "events": ["description of event 1", "description of event 2"],
  "actions": ["description of action 1", "description of action 2"]
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
    };
  } catch (error) {
    console.error("Failed to parse classification response:", responseText);
    return { events: [], actions: [] };
  }
}
