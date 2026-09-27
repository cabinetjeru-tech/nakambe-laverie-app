import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { getBrand } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth/session";
import { PwaRegister } from "@/components/layout/pwa-register";
import { env } from "@/lib/env";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap", weight: ["400", "500", "600", "700", "800"] });

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    metadataBase: new URL(env.appUrl),
    title: { default: `${brand.name} — ${brand.slogan}`, template: `%s · ${brand.shortName}` },
    description: `${brand.name} : plateforme panafricaine de formation professionnelle en ligne, accessible sur ordinateur et smartphone, avec accompagnement pédagogique par intelligence artificielle. Une marque de ${brand.promoter}.`,
    applicationName: brand.shortName,
    manifest: "/manifest.webmanifest",
    icons: { icon: "/icons/favicon-32.png", apple: "/icons/apple-touch-icon.png" },
    appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: "default" },
    openGraph: { siteName: brand.name, locale: "fr_FR", type: "website", images: [{ url: "/brand/akambi-og.png", width: 1200, height: 630, alt: brand.name }] },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const brand = await getBrand();
  return { themeColor: brand.primaryColor, width: "device-width", initialScale: 1 };
}

function safeColor(c: string, fallback: string) {
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [brand, user, jar] = await Promise.all([getBrand(), getCurrentUser(), cookies()]);
  const lowData = user?.lowDataMode || jar.get("nga_lowdata")?.value === "1";
  const style = {
    "--brand-primary": safeColor(brand.primaryColor, "#00123a"),
    "--brand-secondary": safeColor(brand.secondaryColor, "#1f3c88"),
    "--brand-accent": safeColor(brand.accentColor, "#ff6600"),
  } as React.CSSProperties;
  return (
    <html lang={user?.locale ?? "fr"} className={jakarta.variable} style={style}>
      <body className={lowData ? "low-data" : undefined}>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
