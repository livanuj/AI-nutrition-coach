import Markdown, { type Components } from "react-markdown";

// The model may use light Markdown for emphasis. Anything beyond simple
// formatting (links, images, tables) is unwrapped to its text, headings are
// toned down to bold paragraphs, and raw HTML is dropped, so model output
// can't inject markup.
const HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"];
const BLOCK_ELEMENTS = ["p", "strong", "em", "code", "ul", "ol", "li", "br", ...HEADINGS];
const INLINE_ELEMENTS = ["strong", "em", "code", "br"];

const Heading: Components["p"] = ({ children }) => (
  <p className="mt-3 font-semibold first:mt-0">{children}</p>
);

const components: Components = {
  ...Object.fromEntries(HEADINGS.map((tag) => [tag, Heading])),
  p: ({ children }) => <p className="mt-3 first:mt-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/10">
      {children}
    </code>
  ),
  ul: ({ children }) => (
    <ul className="mt-3 list-disc space-y-1 pl-5 first:mt-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-3 list-decimal space-y-1 pl-5 first:mt-0">{children}</ol>
  ),
};

/**
 * Renders Markdown from the AI. Use `inline` inside an existing list item or
 * sentence, where paragraphs and lists would break the layout.
 */
export function MarkdownText({
  children,
  inline = false,
}: {
  children: string;
  inline?: boolean;
}) {
  return (
    <Markdown
      allowedElements={inline ? INLINE_ELEMENTS : BLOCK_ELEMENTS}
      unwrapDisallowed
      skipHtml
      components={components}
    >
      {children}
    </Markdown>
  );
}
