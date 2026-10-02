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
            <svg width="84" height="84" viewBox="0 0 96 96" style={{ borderRadius: 18, border: "3px solid rgba(255,255,255,0.8)" }}>
              <rect width="96" height="96" fill="#00843d" />
              <rect y="80" width="96" height="8" fill="#c8102e" />
              <rect y="88" width="96" height="8" fill="#00592a" />
              <path fill="#fff" fillRule="evenodd" d="M12 18h22a15 15 0 0 1 0 30h-11v22H12zM23 28h10a5 5 0 0 1 0 10H23z" />
              <path fill="#f2b705" fillRule="evenodd" d="M52 38h8.5v32H52zM63.5 70l8.6-32h7.8l8.6 32h-8.4l-1.6-6.4h-6.6L70.3 70zM72.7 57h5.2L75.3 46z" />
            </svg>
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
