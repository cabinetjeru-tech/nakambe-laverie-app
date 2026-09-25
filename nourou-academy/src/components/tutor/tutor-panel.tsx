"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Maximize2, Sparkles, X } from "lucide-react";
import { TutorChat, type TutorCapabilities } from "./tutor-chat";

export function TutorPanel({
  loggedIn,
  tutorName,
  capabilities,
  courseId,
  lessonId,
}: {
  loggedIn: boolean;
  tutorName: string;
  capabilities: TutorCapabilities;
  courseId?: string;
  lessonId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<{ courseId?: string; lessonId?: string }>({ courseId, lessonId });
  useEffect(() => {
    const sync = () => setCtx(window.__ngaTutorContext ?? { courseId, lessonId });
    sync();
    window.addEventListener("nga-tutor-context", sync);
    return () => window.removeEventListener("nga-tutor-context", sync);
  }, [courseId, lessonId]);
  const pathname = usePathname();
  if (pathname.startsWith("/espace/tuteur")) return null;
  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white shadow-lg ring-4 ring-white hover:bg-navy-900 sm:bottom-6 sm:right-6"
        >
          <Sparkles className="h-4 w-4 text-accent" aria-hidden /> {tutorName}
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-label={`Discussion avec ${tutorName}`}
          className="fixed inset-0 z-50 flex flex-col bg-white sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[640px] sm:max-h-[85vh] sm:w-[420px] sm:rounded-2xl sm:border sm:border-line sm:shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-navy text-white">
                <Sparkles className="h-4 w-4 text-accent" aria-hidden />
              </div>
              <div>
                <div className="text-sm font-semibold text-navy">{tutorName}</div>
                <div className="text-[11px] text-muted">Tuteur pédagogique · 24h/24</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {loggedIn && (
                <Link href="/espace/tuteur" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-sky-50" aria-label="Ouvrir en plein écran">
                  <Maximize2 className="h-4 w-4" />
                </Link>
              )}
              <button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-sky-50" aria-label="Fermer">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 p-3">
            {loggedIn ? (
              <TutorChat compact tutorName={tutorName} capabilities={capabilities} courseId={ctx.courseId} lessonId={ctx.lessonId} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                <Sparkles className="h-10 w-10 text-accent" aria-hidden />
                <div className="mt-3 font-semibold text-navy">Votre tuteur personnel vous attend</div>
                <p className="mt-1 text-sm text-muted">
                  Créez votre compte gratuit pour discuter avec {tutorName} : explications adaptées à votre niveau, exercices, quiz et aide sur vos cours.
                </p>
                <div className="mt-4 flex gap-2">
                  <Link href="/inscription" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-navy">
                    Créer un compte
                  </Link>
                  <Link href="/connexion" className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-navy">
                    Connexion
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
