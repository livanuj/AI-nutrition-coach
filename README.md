# AI Nutrition Coach

Upload a photo of your meal and get instant feedback from an AI nutritionist: a
1–10 health score, estimated calories and macros, what's good, what to watch out
for, and simple swaps to make it healthier.

Built with Next.js 16, Tailwind CSS 4 and a vision model on
[Nebius Token Factory](https://docs.tokenfactory.nebius.com/api-reference/examples/vision-capabilities).

## Getting started

1. Create an API key in [Nebius Token Factory](https://tokenfactory.nebius.com).
2. Copy the env template and add your key:

   ```bash
   cp .env.example .env.local
   # then set NEBIUS_API_KEY=... in .env.local
   ```

3. Install dependencies and start the dev server:

   ```bash
   npm install
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) and upload a food photo.

## Configuration

| Variable         | Required | Description                                                                                                                                 |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEBIUS_API_KEY` | yes      | Your Nebius Token Factory API key.                                                                                                          |
| `NEBIUS_MODEL`   | no       | Vision model ID. Defaults to `google/gemma-3-27b-it`. Any `image2text` model from the [catalog](https://tokenfactory.nebius.com/models) works. |

## How it works

- [app/components/meal-analyzer.tsx](app/components/meal-analyzer.tsx) lets the user pick or drop a photo, resizes it in the browser to at most 1536px (JPEG), and submits it to a Server Action.
- [app/actions.ts](app/actions.ts) validates the upload (JPEG/PNG/WebP, ≤ 4 MB) and converts it to a base64 data URL.
- [lib/nebius.ts](lib/nebius.ts) sends the image to the Nebius OpenAI-compatible chat completions API with a dietitian system prompt that asks for a JSON answer.
- [lib/meal-analysis.ts](lib/meal-analysis.ts) extracts and validates that JSON so the UI always gets a well-formed result.
- [app/components/analysis-result.tsx](app/components/analysis-result.tsx) renders the score, nutrition estimates and feedback.
- [app/components/markdown-text.tsx](app/components/markdown-text.tsx) formats the model's feedback text with [react-markdown](https://github.com/remarkjs/react-markdown), allowing only light formatting (bold, italics, inline code, simple lists) and dropping raw HTML.

Results are AI estimates from a single photo and are not medical advice.
