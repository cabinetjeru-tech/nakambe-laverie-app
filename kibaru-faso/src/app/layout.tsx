import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { EnregistrementSW } from "@/components/installer";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://pedagogue-ia.vercel.app"),
  title: "PÉDAGOGUE.IA — L'intelligence au service de la pédagogie",
  description:
    "Assistant pédagogique pour les enseignants du Burkina Faso, du préscolaire au secondaire : leçons, fiches, exercices, devoirs et corrigés, évaluations, remédiation.",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "PÉDAGOGUE.IA", statusBarStyle: "default" },
  openGraph: { siteName: "PÉDAGOGUE.IA", locale: "fr_BF", type: "website" },
};

/** Police de la marque, servie par le site lui-même (aucun appel à Google depuis le téléphone de l'enseignant). */
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const viewport: Viewport = { themeColor: "#00843d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>
        {children}
        <EnregistrementSW />
      </body>
    </html>
  );
}
