import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ADVISOR_GUIDE } from "@/content/advisor-guide";

const CARD =
  "rounded-[14px] border border-line-1 bg-surface shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]";

/**
 * Renders the advisor guide (docs/advisor-guide.md, bundled via
 * src/content/advisor-guide.ts) styled to match the dashboard. The first `#`
 * heading and its `###` tagline become the page title; blockquotes render as
 * red-accent callout boxes (the outreach scripts).
 */
export function GuideContent() {
  return (
    <article className={`${CARD} px-6 py-7 sm:px-9 sm:py-9`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em] text-ink-1 dark:text-white">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-3 mt-9 border-b border-line-2 pb-2 font-display text-[19px] font-semibold tracking-[-0.015em] text-ink-1 first:mt-2 dark:text-white">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1.5 mt-5 font-display text-[14.5px] font-semibold text-ink-1 dark:text-white">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="my-2.5 text-[14px] leading-[1.65] text-ink-2">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="my-2.5 list-disc space-y-1.5 pl-5 text-[14px] leading-[1.6] text-ink-2 marker:text-ink-4">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2.5 list-decimal space-y-1.5 pl-5 text-[14px] leading-[1.6] text-ink-2 marker:text-ink-4">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-ink-1 dark:text-white">{children}</strong>
          ),
          a: ({ children }) => <span className="text-ink-2">{children}</span>,
          hr: () => <hr className="my-6 border-line-2" />,
          code: ({ children }) => (
            <code className="rounded bg-bg-2 px-1.5 py-0.5 font-mono text-[12.5px] text-ink-1 dark:text-white">
              {children}
            </code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 rounded-r-[8px] border-l-[3px] border-[#C8102E] bg-bg-2 px-4 py-3 text-[13.5px] italic leading-[1.6] text-ink-2">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-[10px] border border-line-1">
              <table className="w-full border-collapse text-[13px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[oklch(0.18_0.02_260)]">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-line-1 px-3 py-2.5 text-left font-semibold text-white">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-line-2 px-3 py-2.5 align-top text-ink-2 [tr:nth-child(even)_&]:bg-bg-2">
              {children}
            </td>
          ),
        }}
      >
        {ADVISOR_GUIDE}
      </ReactMarkdown>
    </article>
  );
}
