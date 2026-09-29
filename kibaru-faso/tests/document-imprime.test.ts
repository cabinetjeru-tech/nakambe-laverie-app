import { describe, expect, it } from "vitest";
import { aDejaIdentification, anneeScolaireCourante, buildDocumentHtml, decouperTitre, extraireTitre } from "../src/lib/document-imprime";

const entete = { etablissement: "Lycée Bogodogo", ville: "Ouagadougou", enseignant: "M. Ouédraogo", discipline: "SVT", classe: "4e", duree: "55 min", theme: "La digestion" };

describe("document imprimé", () => {
  it("année scolaire : rentrée en septembre", () => {
    expect(anneeScolaireCourante(new Date(2026, 8, 1))).toBe("2026-2027");
    expect(anneeScolaireCourante(new Date(2027, 5, 30))).toBe("2026-2027");
  });

  it("titre principal déplacé dans le bandeau, découpé en type et sujet", () => {
    expect(extraireTitre("<h1>Fiche pédagogique — La digestion</h1><p>x</p>")).toEqual({ titre: "Fiche pédagogique — La digestion", corps: "<p>x</p>" });
    expect(extraireTitre("<p>x</p>").titre).toBeNull();
    expect(decouperTitre("Fiche pédagogique — La digestion")).toEqual({ type: "Fiche pédagogique", sujet: "La digestion" });
    expect(decouperTitre("Devoir surveillé")).toEqual({ type: "Devoir surveillé", sujet: null });
  });

  it("fiche de l'enseignant : en-tête, bandeau, cartouche, pied, badges masqués", () => {
    const html = buildDocumentHtml("t", "<h1>Fiche pédagogique — La digestion</h1><p><span class=\"badge\">PROPOSITION PÉDAGOGUE.IA</span></p><h2>Objectifs</h2>", { pied: true, entete });
    expect(html).toContain("BURKINA FASO");
    expect(html).toContain("Lycée Bogodogo");
    expect(html).toContain("Enseignant : M. Ouédraogo");
    expect(html).toMatch(/<div class="type">Fiche pédagogique<\/div><div class="sujet">La digestion<\/div>/);
    expect(html).toContain('<td class="lib">Date</td>');
    expect(html).toContain("Préparé avec l'assistance de PÉDAGOGUE.IA");
    expect(html).toContain(".badge { display: none; }");
    expect(html.match(/<h1/g)).toBeNull();
  });

  it("copie élève : zone nom et note, sans enseignant ni mention de la plateforme", () => {
    const html = buildDocumentHtml("t", "<h3>Exercice 1</h3>", { pied: false, copieEleve: true, intitule: "Sujet", entete });
    expect(html).toContain("Nom et prénom(s)");
    expect(html).toContain("/ 20");
    expect(html).not.toContain("M. Ouédraogo");
    expect(html).not.toContain("Préparé avec l'assistance");
    expect(html).toMatch(/<div class="type">Sujet<\/div><div class="sujet">La digestion<\/div>/);
  });

  it("pas de second cartouche si le document a déjà son tableau d'identification", () => {
    const corps = "<table><tr><th>Discipline</th><th>Classe</th></tr><tr><td>SVT</td><td>4e</td></tr></table>";
    expect(aDejaIdentification(corps)).toBe(true);
    expect(buildDocumentHtml("t", corps, { pied: true, entete })).not.toContain('class="cartouche"');
    expect(aDejaIdentification("<p>rien</p>")).toBe(false);
  });

  it("échappe les données saisies par l'enseignant", () => {
    expect(buildDocumentHtml("t", "<p>x</p>", { pied: true, entete: { etablissement: "<script>" } })).toContain("&lt;script&gt;");
  });
});
