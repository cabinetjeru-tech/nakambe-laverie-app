"""Modèle de rapport intermédiaire, construit UNIQUEMENT à partir du JSON normalisé.

Principe anti-divergence : le JSON est transformé une seule fois en un `ReportModel`
(sections + blocs typés). Les moteurs Markdown et PDF ne font que *mettre en forme* ce
modèle ; ils n'accèdent jamais au JSON. Un fait ne peut donc pas apparaître dans l'un
des formats et pas dans l'autre.

Deux gabarits :
- `judiciaire` : rapport d'expertise (cadre légal, méthodologie, intégrité, custody,
  constatations, chronologie, réserves, attestation).
- `entreprise` : rapport d'investigation interne (synthèse exécutive, risques,
  recommandations, annexes d'intégrité).
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from veritrace import CREDIT_LINE, __version__
from veritrace.core.timeutil import parse_iso, utc_now_iso

TEMPLATES = ("judiciaire", "entreprise")

SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"]
SEVERITY_FR = {"critical": "Critique", "high": "Élevée", "medium": "Moyenne", "low": "Faible", "info": "Info"}
CONFIDENCE_FR = {"high": "élevée", "medium": "moyenne", "low": "faible"}
BASIS_FR = {
    "consentement": "Consentement écrit du titulaire",
    "mandat": "Mandat / commission rogatoire",
    "requisition": "Réquisition judiciaire",
    "ordonnance": "Ordonnance du juge",
    "politique-entreprise": "Politique interne de l'entreprise + consentement",
}
CATEGORY_FR = {
    "sms": "SMS / MMS", "call": "Journal d'appels", "contact": "Contacts",
    "browser_history": "Historique de navigation", "location": "Géolocalisation", "exif": "Métadonnées EXIF",
    "app_usage": "Usage des applications", "installed_app": "Applications installées", "wifi": "Réseaux Wi-Fi",
    "bluetooth": "Appareils Bluetooth", "account": "Comptes", "ioc_match": "Correspondances IOC", "other": "Autres",
}
STATUS_FR = {"success": "Succès", "warning": "Avertissement", "failed": "Échec", "skipped": "Non exécuté",
             "partial": "Partiel"}
CUSTODY_FR = {"collected": "Collecte", "hashed": "Hachage", "verified": "Vérification", "copied": "Copie",
              "transferred": "Transfert", "stored": "Stockage", "parsed": "Analyse", "reported": "Rapport",
              "sealed": "Scellé", "returned": "Restitution"}


# --------------------------------------------------------------------------- blocs
@dataclass
class Paragraph:
    text: str
    style: str = "body"            # body | note | warning | small


@dataclass
class Bullets:
    items: list[str]


@dataclass
class KeyValue:
    rows: list[tuple[str, str]]


@dataclass
class Table:
    headers: list[str]
    rows: list[list[str]]
    widths: list[float] | None = None   # proportions relatives (PDF)
    mono_cols: tuple[int, ...] = ()     # colonnes en police à chasse fixe (empreintes)


@dataclass
class Subheading:
    text: str


@dataclass
class Signature:
    lines: list[str]


Block = Paragraph | Bullets | KeyValue | Table | Subheading | Signature


@dataclass
class Section:
    title: str
    blocks: list[Block] = field(default_factory=list)


@dataclass
class Cover:
    report_title: str
    case_title: str
    case_id: str
    org_name: str
    org_lines: list[str]
    logo_path: Path | None
    meta: list[tuple[str, str]]
    confidentiality: str


@dataclass
class ReportModel:
    template: str
    cover: Cover
    sections: list[Section]
    footer: str
    source_sha256: str
    generated_at: str


# --------------------------------------------------------------------------- helpers
class _Fmt:
    def __init__(self, tz_name: str | None) -> None:
        try:
            self.tz = ZoneInfo(tz_name or "UTC")
            self.tz_name = tz_name or "UTC"
        except (ZoneInfoNotFoundError, ValueError):
            self.tz, self.tz_name = ZoneInfo("UTC"), "UTC"

    def ts(self, value: str | None) -> str:
        if not value:
            return "—"
        try:
            dt: datetime = parse_iso(value).astimezone(self.tz)
        except ValueError:
            return value
        return dt.strftime("%d/%m/%Y %H:%M:%S")

    @property
    def tz_label(self) -> str:
        offset = datetime.now(self.tz).strftime("%z")
        return f"{self.tz_name} (UTC{offset[:3]}:{offset[3:]})"


def _v(x: Any) -> str:
    if x is None or x == "" or x == []:
        return "—"
    if isinstance(x, bool):
        return "oui" if x else "non"
    if isinstance(x, list):
        return ", ".join(str(i) for i in x)
    return str(x)


def _size(n: int | None) -> str:
    if n is None:
        return "—"
    for unit in ("o", "Kio", "Mio", "Gio", "Tio"):
        if n < 1024 or unit == "Tio":
            return f"{n:.0f} {unit}" if unit == "o" else f"{n:.2f} {unit}"
        n /= 1024
    return str(n)


def _corr(flag: bool) -> str:
    return "Corroboré" if flag else "Source unique"


def artifact_summary(a: dict[str, Any]) -> str:
    """Résumé lisible d'un artefact, selon sa catégorie."""
    d, c = a.get("data") or {}, a.get("category")
    if c == "sms":
        who = d.get("contact_name") or d.get("address")
        arrow = "reçu de" if d.get("direction") == "incoming" else "envoyé à"
        return f"SMS {arrow} {who} : « {d.get('body') or ''} »"
    if c == "call":
        return f"Appel {d.get('direction')} — {d.get('contact_name') or d.get('number')} ({_v(d.get('duration_s'))} s)"
    if c == "contact":
        return f"{d.get('display_name')} — {_v(d.get('phone_numbers'))}"
    if c == "browser_history":
        return f"{d.get('url')} ({d.get('browser') or 'navigateur ?'})"
    if c == "location":
        acc = f" ±{d['accuracy_m']:.0f} m" if d.get("accuracy_m") is not None else ""
        return f"{d.get('latitude')}, {d.get('longitude')}{acc} ({d.get('provider') or '?'})"
    if c == "exif":
        return f"{d.get('file_path')} — {d.get('make') or ''} {d.get('model') or ''}".strip()
    if c == "app_usage":
        return f"{d.get('package')} — {d.get('event')}"
    if c == "installed_app":
        src = d.get("installer") or "installateur inconnu (sideload ?)"
        return f"{d.get('package')} v{d.get('version_name') or '?'} — {src}"
    if c == "wifi":
        return f"SSID « {d.get('ssid')} » ({d.get('bssid') or 'BSSID ?'})"
    if c == "bluetooth":
        return f"{d.get('name') or 'sans nom'} [{d.get('mac')}]"
    if c == "account":
        return f"{d.get('account_name')} ({d.get('account_type')})"
    if c == "ioc_match":
        return f"{d.get('indicator_type')} « {d.get('indicator')} » — {d.get('ioc_source')}"
    return ", ".join(f"{k}={v}" for k, v in list(d.items())[:4])


def _resolve_logo(org: dict[str, Any], case_root: Path | None) -> Path | None:
    raw = org.get("logo_path")
    if not raw:
        return None
    p = Path(raw)
    if not p.is_absolute() and case_root is not None:
        p = case_root / p
    return p if p.is_file() else None


# --------------------------------------------------------------------------- sections communes
def _cover(doc: dict, template: str, fmt: _Fmt, case_root: Path | None, source_sha: str) -> Cover:
    case, org = doc["case"], doc["case"]["organization"]
    auth = case["legal_authorization"]
    rp = case.get("requesting_party") or {}
    org_lines = [x for x in (org.get("address"), org.get("phone"), org.get("email"), org.get("website"),
                             org.get("registration")) if x]
    meta = [("Référence affaire", case["case_id"])]
    if template == "judiciaire":
        title = "RAPPORT D'EXPERTISE — INVESTIGATION NUMÉRIQUE MOBILE"
        if rp:
            meta.append(("Autorité requérante", f"{rp.get('name')}" + (f" (réf. {rp['reference']})" if rp.get("reference") else "")))
        conf = "Document couvert par le secret de l'enquête / de l'instruction — diffusion restreinte."
    else:
        title = "RAPPORT D'INVESTIGATION — SÉCURITÉ MOBILE"
        if rp:
            meta.append(("Client / demandeur", rp.get("name", "—")))
        conf = "CONFIDENTIEL — usage interne, diffusion limitée aux destinataires désignés."
    meta += [
        ("Base légale", f"{BASIS_FR.get(auth['basis'], auth['basis'])} — réf. {auth['reference']}"),
        ("Examinateur(s)", ", ".join(e["name"] for e in case["examiners"])),
        ("Date du rapport", fmt.ts(utc_now_iso())),
        ("Fuseau d'affichage", fmt.tz_label),
        ("Empreinte des données sources", source_sha),
    ]
    return Cover(title, case["title"], case["case_id"], org["name"], org_lines,
                 _resolve_logo(org, case_root), meta, conf)


def _devices_table(doc: dict) -> Table:
    rows = [[d["device_id"], f"{d['manufacturer']} {d['model']}", _v(d.get("android_version")),
             _v(d.get("security_patch")), _v(d.get("serial")), _v(d.get("imei")), _v(d.get("seal_number"))]
            for d in doc["devices"]]
    return Table(["ID", "Appareil", "Android", "Patch sécu.", "N° série", "IMEI", "Scellé"], rows,
                 [0.8, 2.2, 0.8, 1.1, 1.3, 1.6, 1.2])


def _acquisitions_table(doc: dict, fmt: _Fmt) -> Table:
    rows = [[a["acquisition_id"], a["device_id"], a["method"], fmt.ts(a["started_at"]), fmt.ts(a.get("ended_at")),
             a["operator"], STATUS_FR.get(a["status"], a["status"])] for a in doc["acquisitions"]]
    return Table(["ID", "Appareil", "Méthode", "Début", "Fin", "Opérateur", "Statut"], rows,
                 [0.9, 0.8, 1.1, 1.5, 1.5, 1.5, 0.9])


def _tools_table(doc: dict, fmt: _Fmt) -> Table:
    rows = [[r["run_id"], f"{r['tool']['name']} {r['tool'].get('version') or '(version ?)'}",
             fmt.ts(r["started_at"]), STATUS_FR.get(r["status"], r["status"]), str(r.get("artifacts_produced", 0)),
             r.get("message") or ""] for r in doc["tool_runs"]]
    return Table(["Exécution", "Outil / version", "Début", "Statut", "Artefacts", "Remarque"], rows,
                 [1.3, 1.4, 1.4, 1.0, 0.8, 2.2])


def _evidence_table(doc: dict, fmt: _Fmt) -> Table:
    rows = [[e["evidence_id"], e["label"], _size(e.get("size_bytes")), fmt.ts(e["collected_at"]), e["sha256"]]
            for e in doc["evidence_items"]]
    return Table(["ID", "Description", "Taille", "Collecte", "SHA-256"], rows, [0.7, 1.9, 0.9, 1.3, 3.2],
                 mono_cols=(4,))


def _custody_table(doc: dict, fmt: _Fmt) -> Table:
    rows = [[c["event_id"], fmt.ts(c["timestamp"]), c["evidence_id"], CUSTODY_FR.get(c["action"], c["action"]),
             c["actor"], c.get("location") or "—", c["sha256"]] for c in doc["custody_chain"]]
    return Table(["N°", "Date", "Preuve", "Action", "Qui", "Où", "Empreinte SHA-256"], rows,
                 [0.7, 1.2, 0.6, 0.8, 1.1, 1.3, 2.6], mono_cols=(6,))


def _timeline_table(events: list[dict], fmt: _Fmt) -> Table:
    rows = [[fmt.ts(t["timestamp"]), CATEGORY_FR.get(t["category"], t["category"]), t["summary"],
             _corr(t["corroborated"]), ", ".join(t["artifact_ids"])] for t in events]
    return Table(["Date / heure", "Type", "Événement", "Fiabilité", "Artefacts"], rows,
                 [1.3, 1.2, 3.4, 0.9, 1.2])


def _inventory_table(doc: dict) -> Table:
    total, corr = Counter(), Counter()
    for a in doc["artifacts"]:
        total[a["category"]] += 1
        if a["corroboration"]["status"] == "corroborated":
            corr[a["category"]] += 1
    rows = [[CATEGORY_FR.get(c, c), str(n), str(corr[c])] for c, n in sorted(total.items(), key=lambda x: -x[1])]
    rows.append(["Total", str(sum(total.values())), str(sum(corr.values()))])
    return Table(["Catégorie", "Artefacts", "dont corroborés"], rows, [3, 1, 1])


def _artifacts_detail(doc: dict, ids: list[str], fmt: _Fmt) -> Table:
    idx = {a["artifact_id"]: a for a in doc["artifacts"]}
    rows = []
    for aid in ids:
        a = idx.get(aid)
        if not a:
            continue
        src = a["source"]
        loc = src.get("file_path") or "—"
        if src.get("record_ref"):
            loc += f" ({src['record_ref']})"
        rows.append([aid, fmt.ts(a.get("timestamp")), artifact_summary(a),
                     f"{src['tool']['name']} / {src['evidence_id']}", loc,
                     _corr(a["corroboration"]["status"] == "corroborated")])
    return Table(["Artefact", "Date", "Contenu", "Outil / preuve", "Emplacement source", "Fiabilité"], rows,
                 [0.9, 1.2, 2.5, 1.1, 2.2, 0.9])


def _findings_blocks(doc: dict, fmt: _Fmt, with_reco: bool) -> list[Block]:
    blocks: list[Block] = []
    fs = sorted(doc["findings"], key=lambda f: SEVERITY_ORDER.index(f["severity"]))
    if not fs:
        return [Paragraph("Aucun constat n'a été retenu à l'issue de l'analyse.")]
    for f in fs:
        blocks.append(Subheading(f"{f['finding_id']} — {f['title']}"))
        kv = [("Sévérité", SEVERITY_FR[f["severity"]]),
              ("Fiabilité", _corr(f["corroborated"]) + (" (plusieurs outils concordants)" if f["corroborated"] else "")),
              ("Artefacts à l'appui", _v(f.get("artifact_ids"))),
              ("Preuves", _v(f.get("evidence_ids")))]
        if f.get("confidence"):
            kv.insert(2, ("Confiance", CONFIDENCE_FR[f["confidence"]]))
        blocks.append(KeyValue(kv))
        blocks.append(Paragraph(f["description"]))
        if with_reco and f.get("recommendation"):
            blocks.append(Paragraph(f"Recommandation : {f['recommendation']}", "note"))
    return blocks


def _integrity_blocks(doc: dict, fmt: _Fmt, source_sha: str) -> list[Block]:
    integ = doc["integrity"]
    audit = integ.get("audit") or {}
    rows = [
        ("Données sources (JSON normalisé) — SHA-256", source_sha),
        ("Généré par", f"{integ['generator']['name']} {integ['generator']['version']}"),
        ("Données consolidées le", fmt.ts(integ["generated_at"])),
    ]
    if audit:
        rows += [("Journal d'audit — entrées", str(audit["entries"])),
                 ("Journal d'audit — empreinte de tête", audit["head_hash"]),
                 ("Journal d'audit — chaîne vérifiée", "OUI" if audit["verified"] else "NON — voir réserves")]
    blocks: list[Block] = [KeyValue(rows)]
    if audit and not audit["verified"]:
        blocks.append(Paragraph("ATTENTION : la vérification de la chaîne du journal d'audit a échoué.", "warning"))
    blocks.append(Paragraph(
        "Toute personne disposant du fichier JSON normalisé peut recalculer son empreinte SHA-256 et la comparer "
        "à celle ci-dessus ; le Markdown et le PDF de ce rapport sont produits à partir de ce même fichier.", "small"))
    return blocks


def _limitations(doc: dict) -> list[Block]:
    items = list(doc["case"].get("limitations") or [])
    skipped = [r for r in doc["tool_runs"] if r["status"] in ("skipped", "failed")]
    for r in skipped:
        items.append(f"{r['tool']['name']} : {STATUS_FR[r['status']].lower()} — {(r.get('message') or 'sans détail').rstrip('.')}.")
    items.append("Les horodatages proviennent des bases de l'appareil ; ils dépendent de l'exactitude de son "
                 "horloge et peuvent avoir été modifiés par l'utilisateur ou des applications.")
    items.append("Un fait « corroboré » est confirmé par au moins deux outils indépendants à partir des mêmes "
                 "données ; un fait « source unique » n'a été extrait que par un seul outil.")
    return [Bullets(items)]


# --------------------------------------------------------------------------- gabarits
def _judiciaire(doc: dict, fmt: _Fmt, source_sha: str) -> list[Section]:
    case = doc["case"]
    auth = case["legal_authorization"]
    flagged_ids: list[str] = []
    for f in doc["findings"]:
        flagged_ids += [a for a in f.get("artifact_ids", []) if a not in flagged_ids]
    examiners = case["examiners"]
    return [
        Section("1. Cadre légal et mission", [
            KeyValue([("Base légale", BASIS_FR.get(auth["basis"], auth["basis"])),
                      ("Référence", auth["reference"]),
                      ("Délivrée par", _v(auth.get("issued_by"))),
                      ("Date", fmt.ts(auth.get("issued_at"))),
                      ("Périmètre autorisé", _v(auth.get("scope"))),
                      ("Empreinte du document", _v(auth.get("document_sha256"))),
                      ("Vérifiée par / le", f"{auth['verified_by']} — {fmt.ts(auth['verified_at'])}")]),
            Subheading("Mission"),
            Paragraph(case.get("mission") or "Non précisée."),
            Paragraph("Aucune technique de contournement d'écran de verrouillage ou d'authentification n'a été "
                      "employée. L'acquisition a été réalisée sur un appareil déverrouillé par son titulaire, "
                      "débogage USB activé.", "note"),
        ]),
        Section("2. Matériel examiné", [_devices_table(doc)] + [
            Paragraph(f"{d['device_id']} — état à réception : {d['state_on_receipt']}", "small")
            for d in doc["devices"] if d.get("state_on_receipt")]),
        Section("3. Méthodologie et outils", [
            Paragraph("Acquisition logique via ADB, hachage SHA-256 de chaque élément dès sa collecte, puis analyse "
                      "par plusieurs outils indépendants dont les résultats sont fusionnés dans un format normalisé. "
                      "Les faits extraits à l'identique par plusieurs outils sont marqués « corroborés »."),
            Subheading("Acquisitions"), _acquisitions_table(doc, fmt),
            Subheading("Outils d'analyse"), _tools_table(doc, fmt),
        ]),
        Section("4. Éléments de preuve et intégrité", [_evidence_table(doc, fmt)]),
        Section("5. Chaîne de custody", [_custody_table(doc, fmt)]),
        Section("6. Constatations", _findings_blocks(doc, fmt, with_reco=False)),
        Section("7. Chronologie des événements", [
            Paragraph(f"Heures exprimées dans le fuseau {fmt.tz_label}.", "small"),
            _timeline_table(sorted(doc["timeline"], key=lambda t: t["timestamp"]), fmt)]),
        Section("8. Artefacts cités et inventaire", [
            Subheading("Artefacts à l'appui des constatations"), _artifacts_detail(doc, flagged_ids, fmt),
            Subheading("Inventaire par catégorie"), _inventory_table(doc)]),
        Section("9. Limites et réserves", _limitations(doc)),
        Section("10. Intégrité du rapport", _integrity_blocks(doc, fmt, source_sha)),
        Section("11. Attestation", [
            Paragraph("Je soussigné(e), certifie avoir personnellement accompli les opérations décrites dans le "
                      "présent rapport, dans les limites de l'autorisation mentionnée, et que les constatations "
                      "qui y figurent sont exactes et sincères au regard des éléments examinés."),
            Signature([f"{e['name']}" + (f" — {e['role']}" if e.get("role") else "") for e in examiners]
                      + ["Fait à ____________________, le ____ / ____ / ________", "Signature :"]),
        ]),
    ]


def _entreprise(doc: dict, fmt: _Fmt, source_sha: str) -> list[Section]:
    case = doc["case"]
    sev = Counter(f["severity"] for f in doc["findings"])
    worst = next((s for s in SEVERITY_ORDER if sev[s]), None)
    risk = SEVERITY_FR[worst].upper() if worst else "AUCUN RISQUE IDENTIFIÉ"
    top = sorted(doc["findings"], key=lambda f: SEVERITY_ORDER.index(f["severity"]))[:5]
    flagged = [t for t in doc["timeline"] if t.get("flags")]
    return [
        Section("1. Synthèse exécutive", [
            KeyValue([("Niveau de risque global", risk),
                      ("Constats", ", ".join(f"{SEVERITY_FR[s]} : {sev[s]}" for s in SEVERITY_ORDER if sev[s]) or "0"),
                      ("Appareil(s) examiné(s)", ", ".join(f"{d['manufacturer']} {d['model']}" for d in doc["devices"]) or "—"),
                      ("Artefacts analysés", str(len(doc["artifacts"])))]),
            Paragraph(case.get("mission") or ""),
            Subheading("Points clés"),
            Bullets([f"[{SEVERITY_FR[f['severity']]}] {f['title']}" + (" (corroboré)" if f["corroborated"] else "")
                     for f in top] or ["Aucun constat significatif."]),
        ]),
        Section("2. Constats et recommandations", _findings_blocks(doc, fmt, with_reco=True)),
        Section("3. Périmètre et méthodologie", [
            KeyValue([("Cadre", f"{BASIS_FR.get(case['legal_authorization']['basis'])} — réf. "
                                f"{case['legal_authorization']['reference']}"),
                      ("Périmètre", _v(case["legal_authorization"].get("scope")))]),
            _devices_table(doc), Subheading("Outils"), _tools_table(doc, fmt)]),
        Section("4. Chronologie des événements clés", [
            Paragraph(f"Heures exprimées dans le fuseau {fmt.tz_label}.", "small"),
            _timeline_table(sorted(flagged, key=lambda t: t["timestamp"]), fmt) if flagged
            else Paragraph("Aucun événement signalé.")]),
        Section("5. Limites", _limitations(doc)),
        Section("Annexe A — Intégrité des preuves", [
            _evidence_table(doc, fmt), Subheading("Chaîne de custody"), _custody_table(doc, fmt)]),
        Section("Annexe B — Inventaire des artefacts", [_inventory_table(doc)]),
        Section("Annexe C — Intégrité du rapport", _integrity_blocks(doc, fmt, source_sha)),
    ]


def build_report_model(doc: dict[str, Any], template: str, *, source_sha256: str,
                       case_root: Path | None = None) -> ReportModel:
    """`doc` DOIT avoir été validé au préalable (voir reporting.generate)."""
    if template not in TEMPLATES:
        raise ValueError(f"Gabarit inconnu « {template} » (choix : {', '.join(TEMPLATES)})")
    fmt = _Fmt(doc["case"].get("display_timezone"))
    sections = (_judiciaire if template == "judiciaire" else _entreprise)(doc, fmt, source_sha256)
    return ReportModel(
        template=template,
        cover=_cover(doc, template, fmt, case_root, source_sha256),
        sections=sections,
        footer=CREDIT_LINE,
        source_sha256=source_sha256,
        generated_at=utc_now_iso(),
    )


__all__ = ["build_report_model", "ReportModel", "TEMPLATES", "artifact_summary", "__version__"]
