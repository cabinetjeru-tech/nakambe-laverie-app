"use client";

export function BoutonImprimer({ libelle = "Imprimer / enregistrer en PDF" }: { libelle?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-lg bg-faso px-4 py-2 font-semibold text-white hover:bg-faso-dark print:hidden">
      {libelle}
    </button>
  );
}
