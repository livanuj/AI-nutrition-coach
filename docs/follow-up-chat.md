# Follow-up chat about a meal analysis

Status: planned, not implemented. Tick the boxes in [Todo](#todo) as work lands.

## Goal

When a meal analysis is on screen, the user can ask follow-up questions about it
("Is this OK before a run?", "How do I get more protein here?"). The model answers
as the same dietitian, aware of the analysis it already gave.

- **Replies stream in** token by token instead of appearing after a 5–15 s wait.
- **The conversation is saved in `localStorage`** with the meal, so a reload restores
  the analysis and its chat. Only finished messages are saved. A reply that is still
  streaming lives in React state only.

Out of scope for now: chats about several meals, server-side history.

## How the Nebius API supports this

From the [text generation example](https://docs.tokenfactory.nebius.com/api-reference/examples/text-generation):

- Same OpenAI-compatible endpoint we already use: `POST https://api.tokenfactory.nebius.com/v1/chat/completions`, `Authorization: Bearer $NEBIUS_API_KEY`.
- The API is stateless. Multi-turn chat means sending the whole conversation every time, as an ordered `messages` array of `system`, `user` and `assistant` turns, with the new question last.
- The page lists `max_tokens`, `temperature`, `top_p`, `stop`, `response_format` and others. We don't need `response_format`, because chat replies are plain Markdown, not JSON.
- **Streaming:** the page shows only `stream: false`, but it lists `stream` and `stream_options` as parameters. Being OpenAI-compatible, `stream: true` should return server-sent events (SSE) with text deltas in `choices[0].delta.content`. Todo step 0 confirms this with the configured model before we build on it.

The `openai` SDK (v7.40, already installed) handles the SSE side:
`client.chat.completions.create({ ..., stream: true }, { signal })` resolves to a
`Stream`, which is an async iterable of chunks. HTTP errors (401, 404, 429) reject
that `create()` call before any chunk arrives. Aborting `signal` cancels the
upstream request, so we stop paying for tokens nobody will read.

## Design

### Message sent to Nebius for a follow-up

```
system     CHAT_SYSTEM_PROMPT   (dietitian persona, answer in light Markdown, stay on topic)
user       "Here is my meal. How healthy is it?"
assistant  the stored MealAnalysis, serialized as JSON   ← grounds the chat in the analysis
user       earlier question 1
assistant  earlier answer 1
…
user       new question
```

Decisions:

- **Don't resend the photo.** The analysis JSON (dish, items, portions, nutrition,
  feedback) gives the model enough context. Sending the image on every turn would add
  ~0.5–1 MB to each request and a lot of vision tokens to every billed call.
  If answers turn out too vague about what's on the plate, add the image back to
  the first `user` turn as an `image_url` part. This is a one-line change in
  `buildFollowUpMessages`.
- **Separate system prompt.** `SYSTEM_PROMPT` demands a JSON-only reply. The chat
  needs its own `CHAT_SYSTEM_PROMPT`: short, friendly answers in light Markdown
  (same rules as the analysis: no headings, links, images, tables or HTML). Answers
  should stay about food and nutrition, politely decline other topics, and stay
  away from medical diagnosis.
- **Text model.** `NEBIUS_MODEL` (vision) works for text-only turns, so we reuse it
  and add no new env var.
- **Bounded history.** The server keeps only the last `MAX_CHAT_TURNS` messages
  (20) and caps a question at `MAX_QUESTION_CHARS` (1000). This keeps the request
  size and cost bounded.
- **Don't trust client input.** The endpoint receives the analysis and history from
  the browser, so it re-validates them. The analysis goes through
  `parseMealAnalysis(JSON.stringify(...))`, as `loadLastMeal` already does.
  Roles must be `user` or `assistant`, and content must be a non-empty string,
  trimmed and capped.
- **Reply cleanup.** Some models emit `<think>…</think>` reasoning. While a reply
  streams, the client hides complete blocks and also any unclosed `<think>` block
  at the end, with a shared `visibleReply(text)` helper. The finished reply goes
  through the same helper before it is saved. Render replies with `MarkdownText`
  (block mode), never with `dangerouslySetInnerHTML`. `react-markdown` handles
  partial Markdown (an unclosed `**`) without breaking.

### Why a Route Handler, not a Server Action

The image analysis stays a Server Action. The chat moves to a Route Handler,
`app/api/chat/route.ts`, because:

- the bundled Next 16 docs (`03-api-reference/03-file-conventions/route.md` → "Streaming",
  and `02-guides/streaming.md` → "Streaming in Route Handlers") document LLM streaming
  as a Route Handler that returns `new Response(readableStream)`;
- the client can read `response.body` incrementally and cancel it with an `AbortController`;
- `request.signal` fires when the client disconnects, and we pass it to the SDK
  to cancel the upstream call.

POST Route Handlers are never cached, so `cacheComponents` doesn't affect it.

### Streaming protocol

Keep it plain: the response body is UTF-8 text (`text/plain; charset=utf-8`), with
each chunk being the next piece of the reply. No SSE framing is needed, because there
is a single client and a single message.

| Situation | What the server does | What the client sees |
| --- | --- | --- |
| Bad input | `400` + JSON `{ "error": "…" }` | `!res.ok` → show `error` |
| Missing key, or Nebius 401/404/429/… before the first token | status from `describeApiError` + JSON `{ "error": "…" }` | `!res.ok` → show `error` |
| Stream fails midway | log it, then `controller.error()` | `reader.read()` rejects → show a generic error with Retry |
| User presses Stop / leaves | `request.signal` aborts the SDK stream | the client called `abort()` itself |

Response headers: `Content-Type: text/plain; charset=utf-8`,
`Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. The last one is what
the Next docs use to stop browsers from buffering the response to sniff its type.

### `lib/nebius.ts` changes

Refactor so both calls share the client, model and error handling:

```ts
// shared
function getClient(): { client: OpenAI; model: string }        // throws CoachError on missing key
function toCoachError(err: unknown, model: string): unknown     // maps OpenAI.APIError via describeApiError, else returns err

// existing, unchanged behavior
export async function analyzeMealImage(imageDataUrl: string): Promise<MealAnalysis>

// new
export function buildFollowUpMessages(
  analysis: MealAnalysis,
  history: ChatMessage[],
  question: string,
): ChatCompletionMessageParam[]

export async function streamFollowUp(
  analysis: MealAnalysis,
  history: ChatMessage[],
  question: string,
  signal?: AbortSignal,
): Promise<AsyncIterable<string>>
```

`streamFollowUp` awaits `create({ stream: true, temperature: ~0.5, max_tokens: ~800 }, { signal })`
before returning, so connection and HTTP errors surface as a `CoachError` while the
route can still send a proper status code. It then returns an async generator that
yields each non-empty `chunk.choices[0]?.delta?.content`.

- Rename `MealAnalysisError` to `CoachError`, since it now covers chat too. It is still
  user-facing and shown verbatim. Update the import in `app/actions.ts`.
- `describeApiError`: the 413 message ("That image is too large") is wrong for chat.
  Give it a context argument, or a more generic message ("That request is too large").
  Also return the HTTP status to use, so the route can respond with it.

### Shared code: `lib/chat.ts` (new, client-safe)

`lib/nebius.ts` is `server-only`, so the types, limits and helpers the browser also
needs live in their own file:

```ts
export type ChatMessage = { role: "user" | "assistant"; content: string };
export const MAX_CHAT_TURNS = 20;
export const MAX_QUESTION_CHARS = 1000;
export function sanitizeChatHistory(value: unknown): ChatMessage[]   // used by the route and by storage loading
export function visibleReply(text: string): string                   // strips <think> blocks, including an unclosed trailing one
```

### Route Handler: `app/api/chat/route.ts` (new)

```ts
export async function POST(request: Request): Promise<Response>
// body: { analysis: MealAnalysis, history: ChatMessage[], question: string }
```

1. Reject bodies over ~200 KB, using `Content-Length` and the length of the read text.
   The Server Action `bodySizeLimit` doesn't apply here.
2. `request.json()` → validate (`parseMealAnalysis`, `sanitizeChatHistory`, question length) → `400` on failure.
3. `await streamFollowUp(..., request.signal)`. A `CoachError` returns JSON with
   its status; anything else is logged and returns `500` with a generic message.
4. Wrap the iterator in a `ReadableStream` that encodes each piece with `TextEncoder`.
   It calls `controller.error()` on a mid-stream failure (unless the request was
   aborted), and `close()` when the stream is done.

### Storage: `lib/meal-chat-storage.ts` (new)

The chat is saved under its own key, separate from the last meal:

```ts
const STORAGE_KEY = "ai-nutrition-coach:meal-chat:v1";
type StoredChat = { mealSavedAt: number; messages: ChatMessage[] };
saveMealChat(mealSavedAt, messages)   // best effort, like saveLastMeal
loadMealChat(mealSavedAt)             // returns [] if missing, unreadable, or for a different meal
clearMealChat()
```

- Called only when an exchange completes, never per chunk. A streaming reply
  is not stored.
- A separate key means each message doesn't re-serialize the large image data URL
  stored in `last-meal:v1`. It also leaves that existing format untouched.
- `mealSavedAt` ties the chat to the meal. If the stored chat belongs to another
  meal, it is ignored.
- `meal-analyzer.tsx` needs the current meal's `savedAt`. Today it is created inside
  the save effect and then lost. Keep it in state (`mealId`): set it from
  `lastMeal.savedAt` on restore, and from the new `Date.now()` after a fresh analysis.
- Analyzing a new photo calls `clearMealChat()`, and so does picking a new photo,
  which already clears `restoredAnalysis`.

### UI: `app/components/meal-chat.tsx` (new, client)

- Shown under `AnalysisResult` when the visible analysis is food (`isFood`). It is
  hidden while a new analysis is pending.
- Props: `analysis`, `mealId`. It loads its history from storage on mount or when
  `mealId` changes.
- State: `messages` (finished, persisted), `streamingReply: string | null` (in
  memory only), `error`, and a ref to the current `AbortController`.
- Sending a question:
  1. Append the user message to `messages`, set `streamingReply` to `""`, and clear `error`.
  2. `fetch("/api/chat", { method: "POST", body, signal })`. If `!res.ok`, show the JSON `error`.
  3. Read `res.body.pipeThrough(new TextDecoderStream())` in a loop, appending each
     piece to `streamingReply`.
  4. When the stream is done, append `{ role: "assistant", content: visibleReply(full) }`
     to `messages`, set `streamingReply` to `null`, then call `saveMealChat`.
- **Stop button** while streaming: `abort()`. Keep the partial text the user already
  read as a finished assistant message, add an "(answer stopped)" note, and save it.
- **Errors** (non-OK status or a rejected read): drop the partial reply and show an
  inline error with Retry. Retry resends the same question. The user message is
  saved only after a reply completes, so a failed question doesn't stay in storage.
- **Unmount, a new photo or "Clear chat"** aborts any request still running.
- Layout: a list of message bubbles (user on the right, assistant on the left
  rendered with `MarkdownText`). The streaming bubble has a blinking caret, or the
  `Spinner` until the first token arrives. There is a textarea with a send button
  (Enter sends, Shift+Enter adds a newline), and a character limit.
- With an empty history, show 3 starter chips: "How can I add more protein?",
  "Is this good for weight loss?", "What should I eat later today?".
- Auto-scroll to follow the stream only while the user is already near the bottom,
  so it doesn't pull them back if they scrolled up.
- Accessibility: wrap the list in `aria-live="polite"`, but mark the streaming bubble
  `aria-busy`, so screen readers announce the finished reply rather than every token.
- Match the existing card styling (zinc/emerald, `rounded-3xl`, dark-mode classes).

## Todo

### 0. Spike
- [ ] With `curl -N` and `"stream": true`, confirm the configured `NEBIUS_MODEL` streams SSE deltas. This is one cheap billed call.

### 1. Shared code
- [ ] Create `lib/chat.ts` with `ChatMessage`, the limits, `sanitizeChatHistory`, and `visibleReply`.

### 2. `lib/nebius.ts`
- [ ] Extract `getClient()` and `toCoachError()` from `analyzeMealImage`, with no change in behavior.
- [ ] Rename `MealAnalysisError` to `CoachError` and update `app/actions.ts`.
- [ ] Make `describeApiError` return a message that fits both image and chat requests, plus the HTTP status to use.
- [ ] Add `CHAT_SYSTEM_PROMPT`.
- [ ] Add `buildFollowUpMessages(analysis, history, question)` (pure, with history trimmed to `MAX_CHAT_TURNS`).
- [ ] Add `streamFollowUp()`: `stream: true`, pass `signal` through, await `create()` before returning, yield text deltas.

### 3. Route Handler
- [ ] Re-read the Next 16 Route Handler streaming docs listed above.
- [ ] Create `app/api/chat/route.ts`: size limit, validation, JSON errors with the right status, streaming `ReadableStream` body, headers, abort handling.
- [ ] Check it with `curl -N -X POST localhost:3000/api/chat -d '…'`. Chunks should arrive progressively.

### 4. Storage
- [ ] Create `lib/meal-chat-storage.ts` (`saveMealChat`, `loadMealChat`, `clearMealChat`).
- [ ] Track `mealId` in `meal-analyzer.tsx`, from restore and after a successful save.
- [ ] Clear the chat when a new photo is picked or a new analysis succeeds.

### 5. Chat UI
- [ ] Build `app/components/meal-chat.tsx`: message list, streaming bubble, input, starter chips, Stop, error/Retry, clear button.
- [ ] Abort any request still running on unmount, a new photo, or clear.
- [ ] Render it under `AnalysisResult` in `meal-analyzer.tsx` for food analyses.

### 6. Verify
- [ ] `npx tsc --noEmit` and `npm run lint` pass.
- [ ] `npm run build` passes, and `/api/chat` is listed as a dynamic route.
- [ ] Manual test (`npm run dev`):
  - [ ] Analyze a meal, then ask 2–3 follow-ups that refer to earlier answers. Text should stream in.
  - [ ] Press Stop mid-reply: the partial answer is kept and the request stops in the Network tab.
  - [ ] Reload mid-stream: earlier messages are restored and the half-finished reply is not.
  - [ ] Reload after replies: the chat is restored.
  - [ ] Analyze a new photo: the chat resets.
  - [ ] Non-food photo: no chat is shown.
  - [ ] Bad API key: an inline error with Retry.
  - [ ] In Safari: streaming still appears. Safari buffers the first 1 KB, so very short replies may show all at once.

### 7. Docs
- [ ] Update `CLAUDE.md`: request flow for chat, the second system prompt, the Route Handler, the streaming protocol, and the new storage key. Update `README.md` (feature list).
- [ ] Mark this plan as implemented.
