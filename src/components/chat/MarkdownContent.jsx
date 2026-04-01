import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import CodeBlock from "./CodeBlock";
import { cn } from "../ui/cn";

const components = {
  code({ node, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : "";
    const isBlock = node?.position?.start?.line !== node?.position?.end?.line
      || match
      || (typeof children === "string" && children.includes("\n"));

    if (isBlock) {
      return (
        <CodeBlock language={language}>
          {children}
        </CodeBlock>
      );
    }

    return (
      <code
        className="rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-sm font-medium"
        {...props}
      >
        {children}
      </code>
    );
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:text-primary/80"
      >
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto rounded-lg border border-outline-variant">
        <table className="min-w-full text-sm">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border-b border-outline-variant bg-surface-container px-3 py-2 text-left font-semibold">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="border-b border-outline-variant/50 px-3 py-2">{children}</td>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-3 border-l-4 border-primary/30 pl-4 italic text-on-surface/70">
        {children}
      </blockquote>
    );
  },
  hr() {
    return <hr className="my-4 border-outline-variant" />;
  },
  ul({ children }) {
    return <ul className="my-2 list-disc space-y-1 pl-6">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-2 list-decimal space-y-1 pl-6">{children}</ol>;
  },
  h1({ children }) {
    return <h1 className="mb-3 mt-4 text-xl font-bold">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="mb-2 mt-3 text-lg font-bold">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="mb-2 mt-3 text-base font-semibold">{children}</h3>;
  },
  p({ children }) {
    return <p className="my-1.5 leading-relaxed">{children}</p>;
  },
};

export default function MarkdownContent({ content, isStreaming = false }) {
  return (
    <div className={cn("markdown-body font-body text-[15px]", isStreaming && "streaming-cursor")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  );
}
