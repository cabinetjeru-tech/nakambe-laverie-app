import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/** Image d'aperçu des liens partagés (WhatsApp, Facebook, TikTok) : promesse à gauche, photo d'enseignante à droite. */
export const TAILLE_APERCU = { width: 1200, height: 630 };

export async function imageApercu() {
  const photo = await readFile(path.join(process.cwd(), "public", "og-enseignante.jpg"))
    .then((b) => `data:image/jpeg;base64,${b.toString("base64")}`)
    .catch(() => null);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#00843d", color: "white", fontFamily: "sans-serif" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", width: 80, height: 80, borderRadius: 16, overflow: "hidden", position: "relative" }}>
              <div style={{ flex: 1, background: "#c8102e" }} />
              <div style={{ flex: 1, background: "#00a14b" }} />
              <svg width="80" height="80" viewBox="0 0 96 96" style={{ position: "absolute", left: 0, top: 0 }}>
                <polygon points="48,22 54.2,40.4 73.7,40.6 58,52.2 63.9,70.8 48,59.5 32.1,70.8 38,52.2 22.3,40.6 41.8,40.4" fill="#f2b705" />
              </svg>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: 2 }}>PÉDAGOGUE.IA</div>
              <div style={{ fontSize: 24, opacity: 0.85 }}>L&apos;intelligence au service de la pédagogie</div>
            </div>
          </div>
          <div style={{ marginTop: 48, fontSize: 50, fontWeight: 800, lineHeight: 1.15 }}>Vos cours, devoirs et corrigés prêts en quelques minutes</div>
          <div style={{ marginTop: 18, fontSize: 27, opacity: 0.9 }}>Pour les enseignants du Burkina Faso · du préscolaire à la Terminale</div>
          <div style={{ marginTop: "auto", display: "flex" }}>
            <div style={{ background: "#f2b705", color: "#17202a", fontSize: 32, fontWeight: 800, padding: "12px 26px", borderRadius: 16 }}>1 fiche offerte</div>
          </div>
        </div>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} width={440} height={630} alt="" style={{ width: 440, height: 630, objectFit: "cover" }} />
        )}
      </div>
    ),
    TAILLE_APERCU,
  );
}
