import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Minimal, safe Markdown for model output: paragraphs, **bold**, `code`,
 * bullet and numbered lists, and ### headings. No raw HTML and no links are
 * rendered; everything is emitted as React text, so it cannot inject markup.
 */
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={index} className="rounded bg-canvas px-1 py-0.5 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

type Block = { kind: "p" | "ul" | "ol" | "h"; lines: string[] };

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    const last = blocks.at(-1);
    if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] });
    } else if (heading) {
      blocks.push({ kind: "h", lines: [heading[1] ?? ""] });
    } else if (bullet) {
      if (last?.kind === "ul") last.lines.push(bullet[1] ?? "");
      else blocks.push({ kind: "ul", lines: [bullet[1] ?? ""] });
    } else if (numbered) {
      if (last?.kind === "ol") last.lines.push(numbered[1] ?? "");
      else blocks.push({ kind: "ol", lines: [numbered[1] ?? ""] });
    } else if (last?.kind === "p") {
      last.lines.push(line);
    } else {
      blocks.push({ kind: "p", lines: [line] });
    }
  }

  return (
    <div className={cn("flex flex-col gap-2.5 text-sm leading-6 text-ink-muted", className)}>
      {blocks
        .filter((block) => block.lines.length > 0)
        .map((block, index) => {
          if (block.kind === "h") return <p key={index} className="font-semibold text-ink">{inline(block.lines[0] ?? "")}</p>;
          if (block.kind === "ul" || block.kind === "ol") {
            const List = block.kind === "ul" ? "ul" : "ol";
            return (
              <List key={index} className={cn("flex flex-col gap-1 pl-5", block.kind === "ul" ? "list-disc" : "list-decimal")}>
                {block.lines.map((item, itemIndex) => (
                  <li key={itemIndex}>{inline(item)}</li>
                ))}
              </List>
            );
          }
          return <p key={index}>{block.lines.map((line, lineIndex) => <Fragment key={lineIndex}>{lineIndex > 0 ? " " : null}{inline(line)}</Fragment>)}</p>;
        })}
    </div>
  );
}
