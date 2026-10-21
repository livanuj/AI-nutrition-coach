"use server";

import type { AnalyzeState } from "@/lib/meal-analysis";
import { analyzeMealImage, MealAnalysisError } from "@/lib/nebius";

// Keep in sync with serverActions.bodySizeLimit in next.config.ts.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function analyzeMeal(
  _prevState: AnalyzeState,
  formData: FormData,
): Promise<AnalyzeState> {
  const image = formData.get("image");

  if (!(image instanceof File) || image.size === 0) {
    return { status: "error", message: "Please choose a photo of your meal." };
  }
  if (!ACCEPTED_TYPES.includes(image.type)) {
    return { status: "error", message: "Please upload a JPEG, PNG or WebP image." };
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return { status: "error", message: "That image is too large. Please keep it under 4 MB." };
  }

  const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");

  try {
    const analysis = await analyzeMealImage(`data:${image.type};base64,${base64}`);
    return { status: "success", analysis };
  } catch (err) {
    if (err instanceof MealAnalysisError) {
      return { status: "error", message: err.message };
    }
    console.error("Meal analysis failed:", err);
    return { status: "error", message: "Something went wrong. Please try again." };
  }
}
