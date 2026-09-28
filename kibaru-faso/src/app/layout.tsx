import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MON PROF.IA — L'intelligence artificielle au service de l'éducation",
  description:
    "Assistant pédagogique pour les enseignants du secondaire au Burkina Faso : leçons, fiches, exercices, devoirs et corrigés, évaluations, remédiation.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#00843d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
