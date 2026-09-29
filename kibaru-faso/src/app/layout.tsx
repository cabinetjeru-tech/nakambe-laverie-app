import type { Metadata, Viewport } from "next";
import { EnregistrementSW } from "@/components/installer";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://pedagogue-ia.vercel.app"),
  title: "PÉDAGOGUE.IA — L'intelligence au service de la pédagogie",
  description:
    "Assistant pédagogique pour les enseignants du secondaire au Burkina Faso : leçons, fiches, exercices, devoirs et corrigés, évaluations, remédiation.",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "PÉDAGOGUE.IA", statusBarStyle: "default" },
  openGraph: { siteName: "PÉDAGOGUE.IA", locale: "fr_BF", type: "website" },
};

export const viewport: Viewport = { themeColor: "#00843d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
        <EnregistrementSW />
      </body>
    </html>
  );
}
