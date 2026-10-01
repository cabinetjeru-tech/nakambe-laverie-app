import { CYCLES } from "@/lib/search";

/** Options d'un sélecteur de classe, regroupées par cycle (préscolaire → secondaire). */
export function OptionsClasses() {
  return (
    <>
      {CYCLES.map((cy) => (
        <optgroup key={cy.code} label={cy.label}>
          {cy.classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
