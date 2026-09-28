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
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
