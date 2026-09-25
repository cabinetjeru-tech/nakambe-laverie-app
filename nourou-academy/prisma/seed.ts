/**
 * Données initiales et de DÉMONSTRATION :  npm run db:seed
 * - Super-administrateur : SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (mot de passe généré et affiché s'il manque).
 * - Démonstration (formations, formateurs fictifs, apprenant) sauf si SEED_DEMO=false.
 * En ligne sans accès terminal, utiliser plutôt la page /installation.
 */
import { prisma } from "../src/lib/db";
import { ensureSuperAdmin, seedDemo } from "../src/lib/setup/seed";

async function main() {
  const res = await ensureSuperAdmin({ email: process.env.SEED_ADMIN_EMAIL || "admin@nourou-academy.local", password: process.env.SEED_ADMIN_PASSWORD });
  console.log(res.created ? `✔ Super-administrateur créé : ${res.email} / ${res.password}  (changez ce mot de passe après connexion)` : `• Super-administrateur existant : ${res.email}`);
  if (process.env.SEED_DEMO === "false") return;
  const demoPassword = process.env.SEED_DEMO_PASSWORD || "Demo2026!";
  for (const line of await seedDemo(demoPassword)) console.log(line);
  console.log(`\nComptes de démonstration (mot de passe : ${demoPassword}) :`);
  console.log("  apprenant@demo.nourou-academy.local (apprenant)");
  console.log("  formateur.marketing@demo.nourou-academy.local (formateur)");
  console.log("  assistant@demo.nourou-academy.local (assistant)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
