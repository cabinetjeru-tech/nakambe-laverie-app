import { CYCLES, SERIES } from "@/lib/search";

/** Options d'un sélecteur de classe, regroupées par cycle (préscolaire → secondaire), avec les séries du lycée. */
export function OptionsClasses() {
  return (
    <>
      {CYCLES.map((cy) => (
        <optgroup key={cy.code} label={cy.label}>
          {cy.classes.flatMap((c) => [
            <option key={c} value={c}>
              {SERIES[c] ? `${c} (série non précisée)` : c}
            </option>,
            ...(SERIES[c] ?? []).map((s) => (
              <option key={`${c} ${s}`} value={`${c} ${s}`}>
                {`${c} ${s}`}
              </option>
            )),
          ])}
        </optgroup>
      ))}
    </>
  );
}
