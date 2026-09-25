import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Questions fréquentes" };
export const dynamic = "force-dynamic";

export default async function FaqPage() {
  const faqs = await prisma.faq.findMany({ orderBy: [{ category: "asc" }, { position: "asc" }] });
  const groups = new Map<string, typeof faqs>();
  for (const f of faqs) groups.set(f.category, [...(groups.get(f.category) ?? []), f]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-navy">Questions fréquentes</h1>
      {[...groups.entries()].map(([cat, list]) => (
        <section key={cat} className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-navy">{cat}</h2>
          <div className="space-y-2">
            {list.map((f) => (
              <details key={f.id} className="group rounded-xl border border-line bg-white px-5 py-4">
                <summary className="cursor-pointer list-none font-medium text-navy [&::-webkit-details-marker]:hidden">{f.question}</summary>
                <p className="mt-2 whitespace-pre-line text-sm text-ink">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
      <p className="mt-10 text-sm text-muted">Vous ne trouvez pas votre réponse ? <Link href="/contact" className="font-medium text-sky">Contactez l'assistance</Link>.</p>
    </div>
  );
}
