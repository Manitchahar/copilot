import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.min.css";
import CodeBlock from "./CodeBlock";
import { cn } from "../ui/cn";

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

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
        className="rounded-md border border-border/40 bg-muted/50 px-1.5 py-0.5 font-mono text-[0.875em] text-foreground"
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
        className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary/60 transition-colors"
      >
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="my-4 overflow-x-auto rounded-lg border border-border/40">
        <table className="min-w-full text-sm">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border-b border-border/40 bg-muted/30 px-4 py-2.5 text-left text-[13px] font-semibold text-foreground/80">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="border-b border-border/20 px-4 py-2.5 text-[14px]">{children}</td>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-4 border-l-[3px] border-primary/30 pl-4 text-foreground/70">
        {children}
      </blockquote>
    );
  },
  hr() {
    return <hr className="my-6 border-border/30" />;
  },
  ul({ children }) {
    return <ul className="my-3 list-disc space-y-1.5 pl-6 marker:text-foreground/30">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-3 list-decimal space-y-1.5 pl-6 marker:text-foreground/40">{children}</ol>;
  },
  h1({ children }) {
    return <h1 className="mb-3 mt-6 text-2xl font-semibold tracking-tight">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="mb-2 mt-5 text-xl font-semibold tracking-tight">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="mb-2 mt-4 text-lg font-semibold">{children}</h3>;
  },
  p({ children }) {
    return <p className="my-2 leading-[1.7]">{children}</p>;
  },
  li({ children }) {
    return <li className="leading-[1.7]">{children}</li>;
  },
};

export default React.memo(function MarkdownContent({ content, isStreaming = false }) {
  return (
    <div className={cn(
      "prose-claude text-[15.5px] leading-[1.7] text-foreground",
      isStreaming && "streaming-cursor"
    )}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  );
});
