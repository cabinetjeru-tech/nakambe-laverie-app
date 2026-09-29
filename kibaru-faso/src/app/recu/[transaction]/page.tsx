import type { Metadata } from "next";
import Link from "next/link";
import { dureeFormule, formatDate, formatFcfa } from "@/lib/abonnement";
import { utilisateurCourant } from "@/lib/comptes";
import { CONTACT } from "@/lib/contact";
import { accountsEnabled, adminClient } from "@/lib/supabase/server";
import { BoutonImprimer } from "@/components/bouton-imprimer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reçu de paiement — PÉDAGOGUE.IA", robots: { index: false } };

/** Reçu d'un paiement réussi, visible par l'enseignant qui a payé et par les administrateurs. */
export default async function Recu({ params }: { params: Promise<{ transaction: string }> }) {
  const { transaction } = await params;
  if (!accountsEnabled()) return <Message texte="Les comptes ne sont pas activés." />;
  const user = await utilisateurCourant().catch(() => null);
  if (!user) return <Message texte="Connectez-vous à PÉDAGOGUE.IA pour afficher ce reçu." />;

  const db = adminClient();
  const [{ data: moi }, { data: p }] = await Promise.all([
    db.from("profils").select("role").eq("id", user.id).maybeSingle(),
    db
      .from("paiements")
      .select("id, utilisateur_id, formule_id, montant_fcfa, prix_initial_fcfa, code_promo, statut, moyen, transaction_id, cree_le, maj_le")
      .eq("transaction_id", transaction)
      .maybeSingle(),
  ]);
  if (!p || (p.utilisateur_id !== user.id && moi?.role !== "admin")) return <Message texte="Reçu introuvable." />;
  if (p.statut !== "reussi") return <Message texte="Ce paiement n'a pas abouti : aucun reçu n'est disponible." />;

  const [{ data: client }, { data: formule }, { data: abo }] = await Promise.all([
    db.from("profils").select("email, nom, telephone, etablissement, ville").eq("id", p.utilisateur_id).maybeSingle(),
    db.from("formules").select("libelle, duree_jours").eq("id", p.formule_id).maybeSingle(),
    db.from("abonnements").select("debut, fin").eq("paiement_id", p.id).maybeSingle(),
  ]);
  const remise = p.prix_initial_fcfa && p.prix_initial_fcfa > p.montant_fcfa ? p.prix_initial_fcfa - p.montant_fcfa : 0;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-ink print:py-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/" className="font-semibold text-faso underline underline-offset-2">
          ← Retour à PÉDAGOGUE.IA
        </Link>
        <BoutonImprimer />
      </div>

      <article className="rounded-xl border border-line bg-white p-6 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-4 border-faso pb-4">
          <div>
            <p className="text-2xl font-extrabold text-faso-dark">PÉDAGOGUE.IA</p>
            <p className="text-sm text-muted">
              {CONTACT.entreprise} · {CONTACT.ville}
              <br />
              {CONTACT.telephone} · {CONTACT.email}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">REÇU DE PAIEMENT</p>
            <p className="font-mono text-sm">N° {p.transaction_id}</p>
            <p className="text-sm text-muted">{formatDate(p.maj_le ?? p.cree_le)}</p>
          </div>
        </header>

        <section className="mt-5 text-sm">
          <p className="font-semibold text-faso-dark">Reçu de</p>
          <p>{client?.nom || client?.email}</p>
          {client?.nom && <p className="text-muted">{client.email}</p>}
          {client?.telephone && <p className="text-muted">{client.telephone}</p>}
          {(client?.etablissement || client?.ville) && <p className="text-muted">{[client.etablissement, client.ville].filter(Boolean).join(", ")}</p>}
        </section>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="py-2">Désignation</th>
              <th className="py-2 text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line align-top">
              <td className="py-2">
                Abonnement PÉDAGOGUE.IA — {formule?.libelle ?? p.formule_id}
                {formule && ` (${dureeFormule(formule.duree_jours)})`}
                {abo && (
                  <span className="block text-muted">
                    Accès du {formatDate(abo.debut)} au {formatDate(abo.fin)}
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap py-2 text-right">{formatFcfa(p.prix_initial_fcfa ?? p.montant_fcfa)}</td>
            </tr>
            {remise > 0 && (
              <tr className="border-b border-line">
                <td className="py-2">Remise{p.code_promo ? ` (code ${p.code_promo})` : ""}</td>
                <td className="whitespace-nowrap py-2 text-right">− {formatFcfa(remise)}</td>
              </tr>
            )}
            <tr className="font-bold">
              <td className="py-3">Total payé</td>
              <td className="whitespace-nowrap py-3 text-right text-lg text-faso-dark">{formatFcfa(p.montant_fcfa)}</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-2 text-sm">
          Payé par {p.moyen || "mobile money"} via CinetPay. Statut : <strong className="text-faso">payé</strong>.
        </p>
        <p className="mt-6 border-t border-line pt-3 text-xs text-muted">
          Service numérique édité par {CONTACT.entreprise}. Voir les{" "}
          <Link href="/conditions" className="underline">
            conditions d&apos;utilisation et de vente
          </Link>
          . Pour toute question sur ce paiement, indiquez le numéro du reçu.
        </p>
      </article>
    </main>
  );
}

function Message({ texte }: { texte: string }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-ink">{texte}</p>
      <Link href="/" className="mt-4 inline-block font-semibold text-faso underline underline-offset-2">
        Retour à PÉDAGOGUE.IA
      </Link>
    </main>
  );
}
