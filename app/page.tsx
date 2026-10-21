import { MealAnalyzer } from "./components/meal-analyzer";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-16">
        <header className="flex max-w-2xl flex-col gap-3">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
            <span aria-hidden>🥗</span> AI Nutrition Coach
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
            How healthy is your meal?
          </h1>
          <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Upload a photo of your food and get instant, honest feedback from an AI
            nutritionist: a health score, estimated nutrients and simple ways to
            make it better.
          </p>
        </header>

        <MealAnalyzer />
      </main>

      <footer className="px-4 py-6 text-center text-xs text-zinc-500 dark:text-zinc-500">
        Powered by Nebius Token Factory. Estimates only, not medical advice.
      </footer>
    </div>
  );
}
