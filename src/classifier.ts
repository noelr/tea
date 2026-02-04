import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface ClassificationResult {
  ideas: string[];
  events: string[];
  actions: string[];
}

export async function classifyThought(thought: string): Promise<ClassificationResult> {
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Analyze the following thought/note and extract any ideas, events, and actions from it.

A thought can contain multiple items of each type:
- **Events**: Things that happened or are happening (e.g., "Brigitte called", "meeting was held")
- **Actions**: Things that need to be done or tasks (e.g., "create a new export", "send email")
- **Ideas**: Concepts, insights, or thoughts worth noting (e.g., "we could improve the UI", "interesting approach")

Respond in JSON format only, with no additional text:
{
  "ideas": ["description of idea 1", "description of idea 2"],
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
      ideas: result.ideas || [],
      events: result.events || [],
      actions: result.actions || [],
    };
  } catch (error) {
    console.error("Failed to parse classification response:", responseText);
    return { ideas: [], events: [], actions: [] };
  }
}
