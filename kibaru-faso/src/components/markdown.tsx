"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Source } from "@/lib/store";

/** Rendu Markdown sûr (aucun HTML brut) avec badges de transparence et appels de source [R1]. */

const BADGES: Record<string, string> = {
  "SOURCE KIBARU": "badge badge-source",
  "PROPOSITION PÉDAGOGIQUE KIBARU": "badge badge-proposition",
  "PROPOSITION PEDAGOGIQUE KIBARU": "badge badge-proposition",
  "CONNAISSANCE GÉNÉRALE": "badge badge-general",
  "CONNAISSANCE GENERALE": "badge badge-general",
  // Étiquettes de la première configuration (conversations déjà enregistrées).
  SOURCE: "badge badge-source",
  "PROPOSITION KIBARU": "badge badge-proposition",
  "À VÉRIFIER": "badge badge-verifier",
  "A VÉRIFIER": "badge badge-verifier",
  "A VERIFIER": "badge badge-verifier",
};

function flatText(children: React.ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(flatText).join("");
  return "";
}

/** Les étiquettes [R1] deviennent des segments `code` reconnus ci-dessous (hors blocs de code). */
function markCitations(md: string): string {
  const parts = md.split(/(```[\s\S]*?```)/g);
  return parts.map((p, i) => (i % 2 === 1 ? p : p.replace(/\[(R\d{1,2})\](?!\()/g, "`[$1]`"))).join("");
}

export function Markdown({ text, sources = [] }: { text: string; sources?: Source[] }) {
  const components: Components = {
    strong({ children }) {
      const t = flatText(children).trim().replace(/\s*:$/, "").toUpperCase();
      const cls = BADGES[t];
      return cls ? <span className={cls}>{flatText(children).replace(/\s*:$/, "")}</span> : <strong>{children}</strong>;
    },
    code({ children, className }) {
      const t = flatText(children);
      const m = !className && t.match(/^\[(R\d{1,2})\]$/);
      if (m) {
        const s = sources.find((x) => x.label === m[1]);
        return (
          <span className="cite" title={s ? `${s.title}${s.source ? ` — ${s.source}` : ""} (${s.origin === "enseignant" ? "ma bibliothèque" : "base documentaire KIBARU"})` : "Source"}>
            {m[1]}
          </span>
        );
      }
      return <code className={className}>{children}</code>;
    },
    table({ children }) {
      return (
        <div className="table-wrap">
          <table>{children}</table>
        </div>
      );
    },
    a({ href, children }) {
      const safe = href && /^(https?:|mailto:)/i.test(href) ? href : undefined;
      return (
        <a href={safe} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    img() {
      return null;
    },
  };
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
      {markCitations(text)}
    </ReactMarkdown>
  );
}
