import type { MealAnalysis } from "@/lib/meal-analysis";
import { MarkdownText } from "./markdown-text";

export function AnalysisResult({ analysis }: { analysis: MealAnalysis }) {
  if (!analysis.isFood) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 sm:p-8 dark:border-amber-900 dark:bg-amber-950/40">
        <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-200">
          Hmm, that doesn&apos;t look like food
        </h2>
        <div className="mt-2 text-sm text-amber-800 dark:text-amber-300">
          <MarkdownText>
            {analysis.summary || "Try a clear photo of your plate or snack."}
          </MarkdownText>
        </div>
      </div>
    );
  }

  const tone = scoreTone(analysis.healthScore);
  const { nutrition } = analysis;

  return (
    <article className="flex flex-col gap-6 rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={`text-sm font-semibold ${tone.text}`}>{tone.label}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {analysis.dishName}
            </h2>
          </div>
          <div className={`flex shrink-0 items-baseline rounded-2xl px-3 py-2 ${tone.badge}`}>
            <span className="text-3xl font-bold tabular-nums">{analysis.healthScore}</span>
            <span className="text-sm font-medium opacity-70">/10</span>
          </div>
        </div>
        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
          role="meter"
          aria-label="Health score"
          aria-valuemin={1}
          aria-valuemax={10}
          aria-valuenow={analysis.healthScore}
        >
          <div
            className={`h-full rounded-full ${tone.bar}`}
            style={{ width: `${analysis.healthScore * 10}%` }}
          />
        </div>
        {analysis.summary && (
          <div className="text-base leading-7 text-zinc-700 dark:text-zinc-300">
            <MarkdownText>{analysis.summary}</MarkdownText>
          </div>
        )}
      </header>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Estimated nutrition
        </h3>
        <dl className="grid grid-cols-3 gap-3">
          <Stat label="Calories" value={nutrition.calories} unit="kcal" />
          <Stat label="Protein" value={nutrition.proteinG} unit="g" />
          <Stat label="Carbs" value={nutrition.carbsG} unit="g" />
          <Stat label="Fat" value={nutrition.fatG} unit="g" />
          <Stat label="Fibre" value={nutrition.fiberG} unit="g" />
          <Stat label="Sugar" value={nutrition.sugarG} unit="g" />
        </dl>
      </section>

      {analysis.items.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            What we see
          </h3>
          <ul className="divide-y divide-zinc-100 rounded-2xl border border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
            {analysis.items.map((item, index) => (
              <li key={index} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{item.name}</span>
                  {item.portion && (
                    <span className="text-zinc-500 dark:text-zinc-400"> · {item.portion}</span>
                  )}
                </span>
                {item.calories > 0 && (
                  <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                    ~{item.calories} kcal
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FeedbackList
          title="What's good"
          items={analysis.positives}
          marker="✓"
          className="bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
        />
        <FeedbackList
          title="Watch out for"
          items={analysis.concerns}
          marker="!"
          className="bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        />
      </div>
      <FeedbackList
        title="Make it healthier"
        items={analysis.suggestions}
        marker="→"
        className="bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200"
      />

      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        Values are AI estimates from a single photo and may be off, especially for
        hidden ingredients like oil, sauces or sugar. This isn&apos;t medical advice.
      </p>
    </article>
  );
}

function Stat({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-zinc-800/60">
      <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value === null ? (
          <span className="text-zinc-400 dark:text-zinc-500" title="Not estimated">
            —
          </span>
        ) : (
          <>
            {value}
            <span className="ml-0.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
              {unit}
            </span>
          </>
        )}
      </dd>
    </div>
  );
}

function FeedbackList({
  title,
  items,
  marker,
  className,
}: {
  title: string;
  items: string[];
  marker: string;
  className: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className={`rounded-2xl p-4 ${className}`}>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="flex flex-col gap-1.5 text-sm leading-6">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span aria-hidden className="w-4 shrink-0 font-semibold">
              {marker}
            </span>
            <span>
              <MarkdownText inline>{item}</MarkdownText>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function scoreTone(score: number) {
  if (score >= 8) {
    return {
      label: "Great choice",
      text: "text-emerald-700 dark:text-emerald-400",
      badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200",
      bar: "bg-emerald-500",
    };
  }
  if (score >= 6) {
    return {
      label: "Pretty good",
      text: "text-lime-700 dark:text-lime-400",
      badge: "bg-lime-100 text-lime-800 dark:bg-lime-900/60 dark:text-lime-200",
      bar: "bg-lime-500",
    };
  }
  if (score >= 4) {
    return {
      label: "Could be better",
      text: "text-amber-700 dark:text-amber-400",
      badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
      bar: "bg-amber-500",
    };
  }
  return {
    label: "Not so healthy",
    text: "text-red-700 dark:text-red-400",
    badge: "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200",
    bar: "bg-red-500",
  };
}
