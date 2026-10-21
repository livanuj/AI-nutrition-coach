"use client";

import Image from "next/image";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import { analyzeMeal } from "@/app/actions";
import {
  blobToDataUrl,
  dataUrlToFile,
  loadLastMeal,
  saveLastMeal,
} from "@/lib/last-meal-storage";
import type { AnalyzeState, MealAnalysis } from "@/lib/meal-analysis";
import { AnalysisResult } from "./analysis-result";

const initialState: AnalyzeState = { status: "idle" };

// Phone photos are often 4000px+; this is plenty for the model to see
// the food and keeps uploads well under the Server Action body limit.
const MAX_DIMENSION = 1536;

type Photo = { file: File; previewUrl: string };

export function MealAnalyzer() {
  const [state, formAction, pending] = useActionState(analyzeMeal, initialState);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [dragging, setDragging] = useState(false);
  // The last saved analysis, shown until the user analyzes a new photo.
  // Kept separately because useActionState's state can't be set directly.
  const [restoredAnalysis, setRestoredAnalysis] = useState<MealAnalysis | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const userPickedPhotoRef = useRef(false);
  // The photo that produced the current result, even if another was picked mid-request.
  const submittedPhotoRef = useRef<File | null>(null);

  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.previewUrl);
    };
  }, [photo]);

  // Restore after mount rather than in initial state, since the page is
  // prerendered and localStorage only exists in the browser.
  useEffect(() => {
    const lastMeal = loadLastMeal();
    if (!lastMeal) return;

    let cancelled = false;
    void dataUrlToFile(lastMeal.imageDataUrl)
      .then((file) => {
        if (cancelled || userPickedPhotoRef.current) return;
        setPhoto({ file, previewUrl: URL.createObjectURL(file) });
        setRestoredAnalysis(lastMeal.analysis);
        setShowResult(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const file = submittedPhotoRef.current;
    if (state.status !== "success" || !file) return;

    void blobToDataUrl(file)
      .then((imageDataUrl) =>
        saveLastMeal({ imageDataUrl, analysis: state.analysis, savedAt: Date.now() }),
      )
      .catch(() => {});
  }, [state]);

  async function selectFile(file: File | undefined) {
    if (!file) return;
    userPickedPhotoRef.current = true;
    setPhotoError(null);
    setShowResult(false);
    setRestoredAnalysis(null);

    if (!file.type.startsWith("image/")) {
      setPhotoError("That file isn't an image. Please choose a photo.");
      return;
    }

    try {
      const resized = await resizeImage(file);
      setPhoto({ file: resized, previewUrl: URL.createObjectURL(resized) });
    } catch {
      setPhotoError("We couldn't read that image. Try a JPEG or PNG photo.");
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    void selectFile(event.dataTransfer.files[0]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photo) return;

    const formData = new FormData();
    formData.set("image", photo.file);
    submittedPhotoRef.current = photo.file;
    setShowResult(true);
    startTransition(() => formAction(formData));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`relative flex aspect-[4/3] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-colors ${
            dragging
              ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
              : "border-zinc-300 bg-zinc-50 hover:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-emerald-600"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              void selectFile(event.target.files?.[0]);
              // Allow re-selecting the same file after an error.
              event.target.value = "";
            }}
          />
          {photo ? (
            <Image
              src={photo.previewUrl}
              alt="Your meal"
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                <CameraIcon />
              </span>
              <span className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                Add a photo of your meal
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                Drag and drop, or tap to choose or take a picture
              </span>
            </div>
          )}
        </label>

        {photoError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {photoError}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={!photo || pending}
            className="inline-flex h-12 items-center sm:flex-1 justify-center gap-2 rounded-full bg-emerald-600 px-6 font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
          >
            {pending && <Spinner />}
            {pending ? "Analyzing…" : "Analyze my meal"}
          </button>
          {photo && (
            <button
              type="button"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-300 px-6 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Change photo
            </button>
          )}
        </div>
      </form>

      <section aria-live="polite" aria-busy={pending}>
        {pending ? (
          <LoadingCard />
        ) : showResult && state.status === "error" ? (
          <div
            role="alert"
            className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          >
            <p className="font-medium">We couldn&apos;t analyze that meal</p>
            <p className="mt-1 text-sm">{state.message}</p>
          </div>
        ) : showResult && state.status === "success" ? (
          <AnalysisResult analysis={state.analysis} />
        ) : showResult && restoredAnalysis ? (
          <AnalysisResult analysis={restoredAnalysis} />
        ) : (
          <EmptyCard />
        )}
      </section>
    </div>
  );
}

async function resizeImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not supported");
  // JPEG has no alpha channel, so give transparent PNGs a white background.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  if (!blob) throw new Error("Could not encode image");
  return new File([blob], "meal.jpg", { type: "image/jpeg" });
}

function EmptyCard() {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        How it works
      </h2>
      <ol className="flex flex-col gap-3 text-sm text-zinc-600 dark:text-zinc-400">
        {[
          "Snap or upload a photo of your plate. One meal per photo works best.",
          "Our AI nutritionist identifies the food and estimates portions and nutrients.",
          "You get a health score, what's good, what to watch, and easy swaps to make it healthier.",
        ].map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
              {index + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="flex flex-col gap-5 rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
        Looking closely at your plate…
      </p>
      <div className="flex animate-pulse flex-col gap-4">
        <div className="h-7 w-2/3 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-3 w-full rounded-full bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-5/6 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-16 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          ))}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg
      className="size-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
