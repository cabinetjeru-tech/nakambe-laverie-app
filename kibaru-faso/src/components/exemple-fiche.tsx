/** Extrait d'une préparation, affiché sur la page de présentation pour montrer la qualité avant l'inscription. */

const DEROULEMENT: [string, string, number][] = [
  ["Rappels et mise en situation", "Carré d'un nombre ; problème de l'échelle posée contre un mur.", 10],
  ["Activité de découverte", "Par groupes : carrés construits sur les côtés d'un triangle 3 cm – 4 cm – 5 cm, comparaison des aires.", 15],
  ["Institutionnalisation", "Énoncé du théorème, trace écrite dans les cahiers.", 10],
  ["Exercices d'application", "Calcul de l'hypoténuse, correction au tableau.", 15],
  ["Évaluation et consigne", "Exercice de contrôle, devoir de maison.", 5],
];

export function ExempleFiche() {
  const total = DEROULEMENT.reduce((s, [, , m]) => s + m, 0);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white text-sm shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-faso-50 px-4 py-3">
        <span className="font-bold text-faso-dark">📋 Fiche pédagogique — Le théorème de Pythagore</span>
        <span className="badge badge-proposition">PROPOSITION PÉDAGOGUE.IA</span>
      </div>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Discipline", "Mathématiques"],
            ["Classe", "4e"],
            ["Durée", "55 min"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-line px-1 py-2">
              <div className="text-[11px] uppercase text-muted">{k}</div>
              <div className="break-words text-xs font-semibold sm:text-sm">{v}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="font-semibold text-faso-dark">Objectifs spécifiques</div>
          <p className="mt-1">À la fin de la séance, l&apos;élève doit être capable d&apos;énoncer le théorème de Pythagore et de calculer la longueur de l&apos;hypoténuse d&apos;un triangle rectangle.</p>
        </div>
        <div>
          <table className="w-full border-collapse text-left text-xs sm:text-sm">
            <thead>
              <tr className="bg-surface text-xs uppercase text-muted">
                <th className="border border-line px-2 py-1.5">Étape</th>
                <th className="border border-line px-2 py-1.5">Activités</th>
                <th className="border border-line px-2 py-1.5 text-right">Durée</th>
              </tr>
            </thead>
            <tbody>
              {DEROULEMENT.map(([etape, activite, min]) => (
                <tr key={etape}>
                  <td className="border border-line px-2 py-1.5 font-medium">{etape}</td>
                  <td className="border border-line px-2 py-1.5">{activite}</td>
                  <td className="whitespace-nowrap border border-line px-2 py-1.5 text-right">{min} min</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-xs font-semibold text-faso">✅ Durée vérifiée : {total} min = durée de la séance.</p>
        </div>
        <div className="rounded-lg border-l-4 border-faso bg-faso-50 p-3">
          <div className="font-semibold text-faso-dark">Trace écrite</div>
          <p className="mt-1">Dans un triangle ABC rectangle en A, le carré de l&apos;hypoténuse est égal à la somme des carrés des deux autres côtés : BC² = AB² + AC².</p>
        </div>
        <div>
          <div className="font-semibold text-faso-dark">Évaluation — Exercice 1 (4 points)</div>
          <p className="mt-1">ABC est un triangle rectangle en A avec AB = 6 cm et AC = 8 cm. Calcule BC.</p>
          <p className="mt-1 text-muted">
            <strong className="text-ink">Corrigé :</strong> BC² = 6² + 8² = 36 + 64 = 100, donc BC = 10 cm. <strong className="text-ink">Barème :</strong> égalité de Pythagore 2 pts ·
            calcul 1 pt · résultat avec unité 1 pt = 4 pts ✅
          </p>
        </div>
      </div>
      <div className="border-t border-line bg-surface px-4 py-2 text-xs text-muted">Extrait. La fiche complète comprend aussi le matériel, les consignes, la remédiation et le devoir de maison.</div>
    </div>
  );
}
