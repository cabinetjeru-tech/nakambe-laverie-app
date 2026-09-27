/** Remplace {prenom}, {formation} et {progression} dans le message de relance (fonction pure, testée). */
export function fillNudgeTemplate(template: string, v: { name: string; course: string; progress: number }) {
  const firstName = v.name.trim().split(/\s+/)[0] || v.name;
  return template.replaceAll("{prenom}", firstName).replaceAll("{formation}", v.course).replaceAll("{progression}", String(v.progress));
}
