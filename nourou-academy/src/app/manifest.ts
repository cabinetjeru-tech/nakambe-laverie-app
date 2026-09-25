import type { MetadataRoute } from "next";
export const dynamic = "force-dynamic";
import { getBrand } from "@/lib/settings";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await getBrand();
  return {
    name: brand.name,
    short_name: brand.shortName,
    description: brand.slogan,
    start_url: "/espace",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: brand.primaryColor,
    lang: "fr",
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Mes formations", url: "/espace/formations" },
      { name: "Tuteur IA", url: "/espace/tuteur" },
    ],
  };
}
