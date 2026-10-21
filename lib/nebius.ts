import "server-only";

import OpenAI from "openai";
import { parseMealAnalysis, type MealAnalysis } from "./meal-analysis";

// Nebius Token Factory exposes an OpenAI-compatible API.
// https://docs.tokenfactory.nebius.com/api-reference/examples/vision-capabilities
const NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1/";
const DEFAULT_MODEL = "google/gemma-3-27b-it";

const SYSTEM_PROMPT = `You are a friendly, honest registered dietitian. The user sends a photo of a meal. Identify the foods, estimate portion sizes and nutrition, and judge how healthy the meal is for a typical adult.

Scoring guide for healthScore (integer 1-10):
- 9-10: balanced plate of whole foods, plenty of vegetables, lean protein, fibre, little added sugar or processed food.
- 6-8: mostly healthy with a few drawbacks (portion size, refined carbs, some added fat or salt).
- 3-5: notable issues such as deep-fried food, heavy refined carbs, high sugar, or few vegetables.
- 1-2: highly processed, very high in sugar, salt or saturated fat with little nutritional value.

Respond with a single JSON object and nothing else, using exactly this shape:
{
  "isFood": boolean,
  "dishName": string,
  "summary": string,
  "healthScore": number,
  "items": [{ "name": string, "portion": string, "calories": number }],
  "nutrition": { "calories": number, "proteinG": number, "carbsG": number, "fatG": number, "fiberG": number, "sugarG": number },
  "positives": string[],
  "concerns": string[],
  "suggestions": string[]
}

Rules:
- "summary" is 1-2 sentences giving your overall verdict, written directly to the user.
- "nutrition" is your estimate for everything visible on the plate.
- "positives", "concerns" and "suggestions" have at most 4 short items each. Suggestions are concrete swaps or additions.
- "summary" and the list items may use light Markdown: **bold** for the key food, nutrient or number in each point, *italics* for gentle emphasis. Do not use headings, links, images, tables or HTML, and do not start list items with "-" or numbers.
- If the image does not show food or drink, set "isFood" to false, describe what you see in "summary", use 0 for numbers and empty lists.`;

export class MealAnalysisError extends Error {}

export async function analyzeMealImage(imageDataUrl: string): Promise<MealAnalysis> {
  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey) {
    throw new MealAnalysisError(
      "The server is missing NEBIUS_API_KEY. Add it to .env.local and restart.",
    );
  }

  const client = new OpenAI({ baseURL: NEBIUS_BASE_URL, apiKey });
  const model = process.env.NEBIUS_MODEL || DEFAULT_MODEL;

  let reply: string | null | undefined;
  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 1500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Here is my meal. How healthy is it?" },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    });
    reply = completion.choices[0]?.message.content;
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      console.error(`Nebius request failed (${err.status}):`, err.message);
      throw new MealAnalysisError(describeApiError(err.status, model));
    }
    throw err;
  }

  if (!reply) {
    throw new MealAnalysisError("The AI returned an empty answer. Please try again.");
  }

  try {
    return parseMealAnalysis(reply);
  } catch (err) {
    console.error("Could not parse model reply:", err, reply);
    throw new MealAnalysisError(
      "The AI's answer couldn't be read. Please try again.",
    );
  }
}

function describeApiError(status: number | undefined, model: string): string {
  switch (status) {
    case 401:
    case 403:
      return "Nebius rejected the API key. Check NEBIUS_API_KEY.";
    case 404:
      return `The model "${model}" isn't available. Set NEBIUS_MODEL to a current vision model.`;
    case 413:
      return "That image is too large. Please try a smaller photo.";
    case 429:
      return "Too many requests right now. Please wait a moment and try again.";
    default:
      return "The nutrition AI is unavailable right now. Please try again.";
  }
}
