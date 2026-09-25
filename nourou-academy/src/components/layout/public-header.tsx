import Link from "next/link";
import { Menu, Sparkles } from "lucide-react";
import { getBrand } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth/session";
import { homeFor } from "@/lib/permissions";
import { Logo } from "./logo";
import { buttonClass } from "../ui";
import { t } from "@/lib/i18n";

const nav = [
  { href: "/formations", label: t("nav.courses") },
  { href: "/formateurs", label: t("nav.trainers") },
  { href: "/tuteur-ia", label: t("nav.tutor") },
  { href: "/tarifs", label: t("nav.pricing") },
  { href: "/blog", label: t("nav.resources") },
  { href: "/contact", label: t("nav.contact") },
];

export async function PublicHeader() {
  const [brand, user] = await Promise.all([getBrand(), getCurrentUser()]);
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo name={brand.name} logoUrl={brand.logoUrl} />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigation principale">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm font-medium text-ink hover:bg-sky-50 hover:text-navy">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 sm:flex">
          {user ? (
            <Link href={homeFor(user.role)} className={buttonClass("primary", "md")}>
              Mon espace
            </Link>
          ) : (
            <>
              <Link href="/connexion" className={buttonClass("ghost", "md")}>
                Connexion
              </Link>
              <Link href="/inscription" className={buttonClass("accent", "md")}>
                <Sparkles className="h-4 w-4" aria-hidden /> Commencer gratuitement
              </Link>
            </>
          )}
        </div>
        <details className="relative lg:hidden">
          <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-lg border border-line text-navy [&::-webkit-details-marker]:hidden" aria-label="Menu">
            <Menu className="h-5 w-5" />
          </summary>
          <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-line bg-white p-2 shadow-soft">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-sky-50">
                {n.label}
              </Link>
            ))}
            <div className="my-2 border-t border-line" />
            {user ? (
              <Link href={homeFor(user.role)} className={buttonClass("primary", "md", "w-full")}>
                Mon espace
              </Link>
            ) : (
              <div className="grid gap-2">
                <Link href="/connexion" className={buttonClass("outline", "md", "w-full")}>
                  Connexion
                </Link>
                <Link href="/inscription" className={buttonClass("accent", "md", "w-full")}>
                  S'inscrire
                </Link>
              </div>
            )}
          </div>
        </details>
      </div>
    </header>
  );
}
