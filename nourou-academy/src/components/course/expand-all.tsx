"use client";
import { useState } from "react";

/** Bouton « Tout développer / Tout réduire » pour les sections du programme. */
export function ExpandAll({ targetId }: { targetId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        const next = !open;
        document.querySelectorAll<HTMLDetailsElement>(`#${targetId} details`).forEach((d) => (d.open = next));
        setOpen(next);
      }}
      className="text-sm font-semibold text-sky hover:underline"
    >
      {open ? "Tout réduire" : "Tout développer"}
    </button>
  );
}
