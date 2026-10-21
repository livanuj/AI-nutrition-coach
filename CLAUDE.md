# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

`AGENTS.md` is maintained by `next dev` (the Next.js rules block, plus an agent-feedback block because `experimental.agentFeedback` is on). Don't hand-edit inside its `<!-- BEGIN/END -->` markers; commit it as-is.

## What this is

AI Nutrition Coach: the user uploads a meal photo, a Nebius Token Factory vision model analyzes it, and the page shows a 1–10 health score, estimated nutrition, and feedback. Next.js 16 (App Router, React 19), Tailwind CSS 4, TypeScript.

## Commands

```bash
npm run dev          # dev server on http://localhost:3000 (Turbopack)
npm run build        # production build (also type-checks)
npm run lint         # ESLint flat config (eslint.config.mjs)
npx tsc --noEmit     # type-check only
```

There is no test runner or test suite.

Config lives in `.env.local` (see `.env.example`, which is committed via a `.gitignore` exception):
- `NEBIUS_API_KEY` (required). Without it the app still runs, but every analysis ends in a "missing NEBIUS_API_KEY" error card.
- `NEBIUS_MODEL` (optional). Defaults to `DEFAULT_MODEL` in `lib/nebius.ts`.

Every analysis is a real, billed Nebius request that takes roughly 10–20 s with the default model.

## Architecture

### Request flow
1. `app/components/meal-analyzer.tsx` (client) resizes the photo in the browser to a JPEG of at most 1536px. It builds its own `FormData` and calls the Server Action with `startTransition(() => formAction(formData))` from `useActionState`. It does not use a native form submit, because the resized blob replaces the picked file.
2. `app/actions.ts` (`analyzeMeal`) validates the type (JPEG, PNG or WebP) and size (≤ 4 MB), then turns the image into a base64 data URL. It returns the `AnalyzeState` discriminated union.
3. `lib/nebius.ts` (`server-only`) calls Nebius's OpenAI-compatible API through the `openai` SDK, with `baseURL` set to `https://api.tokenfactory.nebius.com/v1/` and the image sent as an `image_url` content part.
4. `lib/meal-analysis.ts` (`parseMealAnalysis`) turns the model's text reply into a `MealAnalysis`.
5. `app/components/analysis-result.tsx` renders it, and model-written text goes through `MarkdownText`.

### The JSON contract is defined twice and must stay in sync
The response shape lives both in `SYSTEM_PROMPT` (`lib/nebius.ts`) and in the `MealAnalysis` type plus `parseMealAnalysis` (`lib/meal-analysis.ts`). Adding or renaming a field means updating the prompt, the type, the parser and the UI.

### Parsing is deliberately defensive
The request sends no `response_format` or JSON mode, because most Nebius vision models don't advertise JSON mode and the parameter can be rejected. Instead the parser:
- strips `<think>…</think>` blocks
- takes the outermost `{…}`, which tolerates code fences and surrounding prose
- coerces every field (clamps the score to 1–10, caps list length, drops malformed items)

Nutrition values are `number | null`. `null` means the model omitted the value and the UI shows "—". This is kept distinct from a real `0`.

### Errors
A `MealAnalysisError` message is user-facing and is shown verbatim in the UI. Nebius HTTP statuses map to these messages in `describeApiError`. Any other error is logged server-side and replaced with a generic message.

### Model-written text is Markdown
The prompt asks for light Markdown in `summary`, `positives`, `concerns` and `suggestions`. `app/components/markdown-text.tsx` renders it with `react-markdown` and an element allowlist:
- links and images are unwrapped to text, headings become bold paragraphs, and raw HTML is dropped (`skipHtml`)
- use `inline` mode inside list items

Never render model output with `dangerouslySetInnerHTML`.

### Coupled size limits
These three limits work together; change them together:
- the client resize `MAX_DIMENSION` (`meal-analyzer.tsx`)
- the server `MAX_IMAGE_BYTES` (`actions.ts`)
- `experimental.serverActions.bodySizeLimit` (`next.config.ts`; Server Actions default to 1 MB)

## Nebius model availability

Nebius retires serverless models regularly. The model in its vision docs example (`Qwen/Qwen2-VL-72B-Instruct`) is gone, and `Qwen/Qwen2.5-VL-72B-Instruct` was removed on 2026-08-31. A 404 from Nebius usually means the model was retired. To find current vision-capable models without an API key, use `https://tokenfactory.nebius.com/api/public/models_info` and filter for flavors whose `use_cases` include `"image"`. `/v1/models` requires auth.

## Next.js / Tailwind specifics

- `next.config.ts` enables `cacheComponents`, `partialPrefetching` and `experimental.agentFeedback`. Check the bundled docs in `node_modules/next/dist/docs/` before relying on caching or rendering behavior.
- CSS goes through Turbopack's `@tailwindcss/turbopack` loader (configured in `next.config.ts`); there is no PostCSS config. Tailwind v4 is configured CSS-first in `app/globals.css` (`@theme inline`).
- Tailwind utilities live in a cascade layer, so unlayered rules in `globals.css` (such as `body { … }`) override utility classes on the same element. That is why the body font is set in CSS, not with a class.
- The import alias `@/*` maps to the project root.
