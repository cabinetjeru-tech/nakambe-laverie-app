import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://pedagogue-ia.vercel.app"),
  title: "PÉDAGOGUE.IA — L'intelligence au service de la pédagogie",
  description:
    "Assistant pédagogique pour les enseignants du secondaire au Burkina Faso : leçons, fiches, exercices, devoirs et corrigés, évaluations, remédiation.",
  icons: { icon: "/icon.svg" },
  openGraph: { siteName: "PÉDAGOGUE.IA", locale: "fr_BF", type: "website" },
};

export const viewport: Viewport = { themeColor: "#00843d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
