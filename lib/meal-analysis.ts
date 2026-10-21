export type MealItem = {
  name: string;
  portion: string;
  calories: number;
};

/** Estimates for the whole plate; null when the model didn't give a value. */
export type Nutrition = {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
};

export type MealAnalysis = {
  isFood: boolean;
  dishName: string;
  summary: string;
  /** 1 (very unhealthy) to 10 (very healthy). */
  healthScore: number;
  items: MealItem[];
  nutrition: Nutrition;
  positives: string[];
  concerns: string[];
  suggestions: string[];
};

export type AnalyzeState =
  | { status: "idle" }
  | { status: "success"; analysis: MealAnalysis }
  | { status: "error"; message: string };

const MAX_LIST_ITEMS = 6;

/**
 * Pulls the JSON object out of a model reply and coerces it into a
 * MealAnalysis. Models sometimes wrap JSON in code fences or emit reasoning
 * first, so we take the outermost {...} and validate every field.
 */
export function parseMealAnalysis(reply: string): MealAnalysis {
  const text = reply.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("Model reply did not contain a JSON object");
  }

  const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  const nutrition = isRecord(raw.nutrition) ? raw.nutrition : {};

  return {
    isFood: raw.isFood !== false,
    dishName: toText(raw.dishName) || "Your meal",
    summary: toText(raw.summary),
    healthScore: Math.min(10, Math.max(1, Math.round(toAmount(raw.healthScore)))),
    items: Array.isArray(raw.items)
      ? raw.items
          .filter(isRecord)
          .map((item) => ({
            name: toText(item.name),
            portion: toText(item.portion),
            calories: toAmount(item.calories),
          }))
          .filter((item) => item.name)
          .slice(0, MAX_LIST_ITEMS)
      : [],
    nutrition: {
      calories: toOptionalAmount(nutrition.calories),
      proteinG: toOptionalAmount(nutrition.proteinG),
      carbsG: toOptionalAmount(nutrition.carbsG),
      fatG: toOptionalAmount(nutrition.fatG),
      fiberG: toOptionalAmount(nutrition.fiberG),
      sugarG: toOptionalAmount(nutrition.sugarG),
    },
    positives: toTextList(raw.positives),
    concerns: toTextList(raw.concerns),
    suggestions: toTextList(raw.suggestions),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toAmount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function toOptionalAmount(value: unknown): number | null {
  // Number(null) and Number("") are 0, so treat them as missing first.
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function toTextList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(toText).filter(Boolean).slice(0, MAX_LIST_ITEMS)
    : [];
}
