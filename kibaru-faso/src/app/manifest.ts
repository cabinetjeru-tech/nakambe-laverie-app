import type { MetadataRoute } from "next";

/** Application installable sur Android et ordinateur (écran d'accueil), en attendant les applications natives. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PÉDAGOGUE.IA — L'intelligence au service de la pédagogie",
    short_name: "PÉDAGOGUE.IA",
    description: "Assistant pédagogique pour les enseignants du secondaire au Burkina Faso.",
    lang: "fr",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f5",
    theme_color: "#00843d",
    orientation: "portrait",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Nouvelle préparation", short_name: "Nouveau", url: "/", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Mon compte", short_name: "Compte", url: "/?compte=1", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
