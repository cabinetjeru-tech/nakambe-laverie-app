import { ImageResponse } from "next/og";

export const alt = "PÉDAGOGUE.IA — l'assistant pédagogique des enseignants du Burkina Faso";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Image d'aperçu des liens partagés (WhatsApp, Facebook) : drapeau, nom, promesse, essai gratuit. */
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#00843d", color: "white", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 96, height: 96, borderRadius: 18, overflow: "hidden", position: "relative" }}>
            <div style={{ flex: 1, background: "#c8102e" }} />
            <div style={{ flex: 1, background: "#00a14b" }} />
            <svg width="96" height="96" viewBox="0 0 96 96" style={{ position: "absolute", left: 0, top: 0 }}>
              <polygon points="48,22 54.2,40.4 73.7,40.6 58,52.2 63.9,70.8 48,59.5 32.1,70.8 38,52.2 22.3,40.6 41.8,40.4" fill="#f2b705" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: 2 }}>PÉDAGOGUE.IA</div>
            <div style={{ fontSize: 28, opacity: 0.85 }}>L&apos;intelligence au service de la pédagogie</div>
          </div>
        </div>
        <div style={{ marginTop: 60, fontSize: 54, fontWeight: 800, lineHeight: 1.15, maxWidth: 1000 }}>Vos cours, devoirs et corrigés prêts en quelques minutes</div>
        <div style={{ marginTop: 20, fontSize: 30, opacity: 0.9 }}>Pour les enseignants du Burkina Faso · du préscolaire à la Terminale</div>
        <div style={{ marginTop: "auto", display: "flex" }}>
          <div style={{ background: "#f2b705", color: "#17202a", fontSize: 34, fontWeight: 800, padding: "14px 28px", borderRadius: 16 }}>1 fiche offerte</div>
        </div>
      </div>
    ),
    size,
  );
}
