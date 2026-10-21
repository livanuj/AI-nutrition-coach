import { parseMealAnalysis, type MealAnalysis } from "@/lib/meal-analysis";

// Versioned so a future change to the stored shape can ignore old entries.
const STORAGE_KEY = "ai-nutrition-coach:last-meal:v1";

export type LastMeal = {
  imageDataUrl: string;
  analysis: MealAnalysis;
  savedAt: number;
};

/** Best effort: quota or private-mode errors are ignored. */
export function saveLastMeal(entry: LastMeal) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Storage is a convenience; the app works without it.
  }
}

/** Returns null when nothing is stored or the entry is unreadable. */
export function loadLastMeal(): LastMeal | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const raw = JSON.parse(stored) as Record<string, unknown>;
    if (typeof raw.imageDataUrl !== "string" || !raw.imageDataUrl.startsWith("data:image/")) {
      return null;
    }

    return {
      imageDataUrl: raw.imageDataUrl,
      // Re-run the model-reply parser so stale or edited data is coerced
      // into a valid MealAnalysis rather than breaking the UI.
      analysis: parseMealAnalysis(JSON.stringify(raw.analysis)),
      savedAt: typeof raw.savedAt === "number" ? raw.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToFile(dataUrl: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], "meal.jpg", { type: blob.type });
}
