import type { MetadataRoute } from "next";
import { SITE } from "@/lib/campagne";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_URL?.trim() || SITE).replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: ["/decouvrir", "/fiches", "/conditions", "/"], disallow: ["/api/", "/admin", "/recu/", "/auth/"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
