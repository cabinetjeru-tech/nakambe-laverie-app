/** En-tête des pages publiques (bibliothèque de fiches) : logo et appel à l'essai gratuit. */
export function EntetePublic() {
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <a href="/decouvrir" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={32} height={32} className="h-8 w-8 rounded-md" />
          <span className="font-extrabold tracking-wide text-faso-dark">PÉDAGOGUE.IA</span>
        </a>
        <a href="/?inscription=1" className="rounded-lg bg-or px-3 py-1.5 text-sm font-extrabold text-ink hover:brightness-95">
          🎁 Essai gratuit
        </a>
      </div>
    </header>
  );
}

export function AppelEssai({ titre = "Préparez la vôtre en quelques minutes" }: { titre?: string }) {
  return (
    <div className="rounded-2xl bg-faso p-6 text-white">
      <h2 className="text-xl font-extrabold">{titre}</h2>
      <p className="mt-2 text-white/90">
        Indiquez votre classe, votre discipline et la leçon : PÉDAGOGUE.IA rédige la fiche, le devoir, le corrigé et le barème, adaptés à vos élèves. 1 fiche
        offerte, sans paiement.
      </p>
      <a href="/?inscription=1" className="mt-4 inline-block rounded-xl bg-or px-5 py-2.5 font-extrabold text-ink hover:brightness-95">
        Essayer gratuitement
      </a>
    </div>
  );
}
