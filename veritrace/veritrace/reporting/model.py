"""Modèle de rapport intermédiaire, construit UNIQUEMENT à partir du JSON normalisé.

Principe anti-divergence : le JSON est transformé une seule fois en un `ReportModel`
(sections + blocs typés). Les moteurs Markdown et PDF ne font que *mettre en forme* ce
modèle ; ils n'accèdent jamais au JSON. Un fait ne peut donc pas apparaître dans l'un
des formats et pas dans l'autre.

Deux gabarits :

`judiciaire` — rapport d'expertise recevable en justice. Ton neutre et factuel ; chaque
constat renvoie à des artefacts, eux-mêmes rattachés à une preuve hachée. Les faits et
l'interprétation de l'examinateur sont présentés dans des blocs distincts. Aucun niveau
de criticité n'y figure (appréciation, non constat).

`entreprise` — rapport d'audit interne orienté décision : résumé exécutif d'une page
non technique, criticité, plan de remédiation, détails techniques en second plan,
annexe des preuves.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from veritrace import CREDIT_LINE
from veritrace.core.timeutil import parse_iso, utc_now_iso
from veritrace.schema.describe import artifact_summary  # noqa: F401  (réexporté)
from veritrace.schema.validator import artifact_engine

TEMPLATES = ("judiciaire", "entreprise")

SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"]
SEVERITY_FR = {"critical": "Critique", "high": "Élevé", "medium": "Moyen", "low": "Faible", "info": "Information"}
SEVERITY_MEANING = {
    "critical": "Compromission avérée ou exposition majeure — action immédiate requise.",
    "high": "Risque sérieux, exploitation probable — traitement sous quelques jours.",
    "medium": "Risque réel mais limité ou non confirmé — traitement planifié.",
    "low": "Écart mineur, impact faible — amélioration recommandée.",
    "info": "Observation sans risque identifié.",
}
PRIORITY_ORDER = ["immediate", "short_term", "medium_term"]
PRIORITY_FR = {"immediate": "Immédiat (< 48 h)", "short_term": "Court terme (< 30 j)",
               "medium_term": "Moyen terme (< 90 j)"}
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
              "sealed": "Mise sous scellé", "returned": "Restitution"}
METHOD_FR = {
    "adb_backup": ("Sauvegarde ADB (adb backup)",
                   "Sauvegarde logique des données applicatives autorisant la sauvegarde, initiée depuis le poste "
                   "d'examen et confirmée sur l'écran de l'appareil par son titulaire."),
    "adb_pull": ("Copie ciblée (adb pull)",
                 "Copie de fichiers et répertoires accessibles sans privilège (stockage partagé, médias)."),
    "adb_bugreport": ("Rapport système (adb bugreport)",
                      "Archive de diagnostic générée par Android (journaux, état des services, paquets)."),
    "adb_dumpsys": ("État des services (adb shell dumpsys)",
                    "Sortie texte de l'état des services système (paquets installés, permissions, usage)."),
    "adb_getprop": ("Propriétés système (adb shell getprop)",
                    "Lecture des propriétés d'identification de l'appareil (modèle, version, empreinte de build)."),
    "import_external": ("Import externe", "Données remises par un tiers et importées telles quelles."),
}
EXHIBIT_FR = {"screenshot": "Capture d'écran", "export": "Export", "document": "Document", "other": "Autre"}
IMAGE_EXT = {".png", ".jpg", ".jpeg"}

GLOSSARY = [
    ("ADB (Android Debug Bridge)", "Outil officiel de Google permettant à un ordinateur de communiquer avec un "
     "appareil Android dont le débogage USB a été activé par son utilisateur."),
    ("Acquisition logique", "Extraction des données accessibles via les interfaces du système d'exploitation, "
     "par opposition à une copie physique bit à bit de la mémoire."),
    ("ALEAPP", "Android Logs Events And Protobuf Parser — outil libre d'extraction d'artefacts Android."),
    ("Artefact", "Trace numérique élémentaire extraite d'une preuve (un SMS, un appel, une position…)."),
    ("Autopsy", "Plateforme libre d'analyse forensique fondée sur The Sleuth Kit."),
    ("Chaîne de custody", "Traçabilité continue d'une preuve : qui l'a manipulée, quand, où, pour quelle action, "
     "et avec quelle empreinte."),
    ("Corroboré", "Fait extrait de manière identique (même empreinte de contenu) par au moins deux outils "
     "indépendants."),
    ("Empreinte SHA-256", "Valeur de 64 caractères calculée à partir d'un contenu. La moindre modification du "
     "contenu produit une empreinte totalement différente : elle permet d'en vérifier l'intégrité."),
    ("IMEI", "International Mobile Equipment Identity — identifiant unique d'un terminal mobile."),
    ("IOC (indicateur de compromission)", "Élément technique (nom de paquet, domaine, empreinte…) associé à un "
     "logiciel malveillant connu."),
    ("MVT", "Mobile Verification Toolkit (Amnesty International) — détection de logiciels espions par IOC."),
    ("Paquet (package)", "Identifiant technique unique d'une application Android (ex. com.exemple.app)."),
    ("Sideload", "Installation d'une application hors magasin officiel, à partir d'un fichier APK."),
    ("Source unique", "Fait extrait par un seul outil."),
    ("UTC", "Temps universel coordonné, référence horaire internationale."),
]


# --------------------------------------------------------------------------- blocs
@dataclass
class Paragraph:
    text: str
    style: str = "body"   # body | note | warning | small | interpretation


@dataclass
class Label:
    """Intitulé court en gras introduisant un bloc (ex. « Faits constatés »)."""
    text: str


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
class Figure:
    path: Path
    caption: str


@dataclass
class PageBreak:
    pass


@dataclass
class Signature:
    lines: list[str]


Block = Paragraph | Label | Bullets | KeyValue | Table | Subheading | Figure | PageBreak | Signature


@dataclass
class Section:
    title: str
    blocks: list[Block] = field(default_factory=list)
    new_page: bool = False


@dataclass
class Cover:
    report_title: str
    case_title: str
    case_id: str
    org_name: str
    org_lines: list[str]
    logo_path: Path | None
    meta: list[tuple[str, str]]
    devices: Table | None
    confidentiality: str


@dataclass
class ReportModel:
    template: str
    cover: Cover
    sections: list[Section]
    footer: str
    source_sha256: str
    generated_at: str


class ReportPrecheckError(ValueError):
    """Le document est valide mais ne satisfait pas les exigences propres au gabarit."""


# --------------------------------------------------------------------------- contexte
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

    def date(self, value: str | None) -> str:
        return self.ts(value)[:10] if value else "—"

    @property
    def tz_label(self) -> str:
        offset = datetime.now(self.tz).strftime("%z")
        return f"{self.tz_name} (UTC{offset[:3]}:{offset[3:]})"


@dataclass
class _Ctx:
    doc: dict[str, Any]
    fmt: _Fmt
    source_sha: str
    case_root: Path | None

    def __post_init__(self) -> None:
        self.artifacts = {a["artifact_id"]: a for a in self.doc["artifacts"]}
        self.evidence = {e["evidence_id"]: e for e in self.doc["evidence_items"]}
        self.findings = sorted(self.doc["findings"], key=lambda f: SEVERITY_ORDER.index(f["severity"]))

    def resolve(self, rel: str | None) -> Path | None:
        if not rel:
            return None
        p = Path(rel)
        if not p.is_absolute() and self.case_root is not None:
            p = self.case_root / p
        return p if p.is_file() else None


# --------------------------------------------------------------------------- helpers
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


def _os(d: dict) -> str:
    v = f"Android {d['android_version']}" if d.get("android_version") else "Android (version inconnue)"
    return v + (f" — correctif {d['security_patch']}" if d.get("security_patch") else "")


def _operations_period(doc: dict) -> tuple[str | None, str | None]:
    stamps: list[str] = []
    for a in doc["acquisitions"]:
        stamps += [a["started_at"]] + ([a["ended_at"]] if a.get("ended_at") else [])
    for r in doc["tool_runs"]:
        stamps += [r["started_at"]] + ([r["ended_at"]] if r.get("ended_at") else [])
    stamps += [c["timestamp"] for c in doc["custody_chain"]]
    if not stamps:
        return None, None
    parsed = sorted(stamps, key=lambda s: parse_iso(s))
    return parsed[0], parsed[-1]


# --------------------------------------------------------------------------- blocs réutilisables
def _cover(c: _Ctx, template: str) -> Cover:
    doc, fmt = c.doc, c.fmt
    case, org = doc["case"], doc["case"]["organization"]
    auth = case["legal_authorization"]
    rp = case.get("requesting_party") or {}
    org_lines = [x for x in (org.get("address"), org.get("phone"), org.get("email"), org.get("website"),
                             org.get("registration")) if x]
    start, end = _operations_period(doc)
    meta = [("N° d'affaire", case["case_id"])]
    if template == "judiciaire":
        title = "RAPPORT D'EXPERTISE — INVESTIGATION NUMÉRIQUE MOBILE"
        if rp:
            meta.append(("Autorité requérante",
                         rp["name"] + (f" (réf. {rp['reference']})" if rp.get("reference") else "")))
        conf = "Document couvert par le secret de l'enquête / de l'instruction — diffusion restreinte."
    else:
        title = "RAPPORT D'AUDIT — SÉCURITÉ D'UN TERMINAL MOBILE"
        if rp:
            meta.append(("Demandeur", rp["name"]))
        conf = "CONFIDENTIEL — usage interne, diffusion limitée aux destinataires désignés."
    meta += [
        ("Examinateur(s)", ", ".join(e["name"] + (f" — {e['role']}" if e.get("role") else "")
                                     for e in case["examiners"])),
        ("Ouverture de l'affaire", fmt.ts(case["created_at"])),
        ("Période des opérations", f"du {fmt.ts(start)} au {fmt.ts(end)}" if start else "—"),
        ("Date du rapport", fmt.ts(utc_now_iso())),
        ("Autorisation", f"{BASIS_FR.get(auth['basis'], auth['basis'])} — réf. {auth['reference']}"),
        ("Fuseau horaire des dates", fmt.tz_label),
        ("Empreinte des données sources", c.source_sha),
    ]
    devices = None
    if doc["devices"]:
        devices = Table(["Marque", "Modèle", "IMEI", "Système"],
                        [[d["manufacturer"], d["model"], _v(d.get("imei")), _os(d)] for d in doc["devices"]],
                        [1, 1.8, 1.6, 2])
    return Cover(title, case["title"], case["case_id"], org["name"], org_lines,
                 c.resolve(org.get("logo_path")), meta, devices, conf)


def _devices_table(doc: dict) -> Table:
    rows = [[d["device_id"], d["manufacturer"], d["model"], _os(d), _v(d.get("imei")), _v(d.get("serial")),
             _v(d.get("seal_number"))] for d in doc["devices"]]
    return Table(["ID", "Marque", "Modèle", "Système", "IMEI", "N° série", "Scellé"], rows,
                 [0.6, 0.9, 1.5, 1.8, 1.4, 1.1, 1.1])


def _tools_inventory(doc: dict) -> Table:
    """Outils + versions (acquisition et analyse), dédoublonnés."""
    seen: dict[tuple[str, str], list[str]] = {}
    for a in doc["acquisitions"]:
        t = a.get("tool") or {}
        if t.get("name"):
            seen.setdefault((t["name"], t.get("version") or "non déterminée"), []).append("Acquisition")
    for r in doc["tool_runs"]:
        key = (r["tool"]["name"], r["tool"].get("version") or "non déterminée")
        mode = {"executed": ", exécuté par Veritrace", "imported": ", sortie importée"}.get(r.get("tool_mode") or "", "")
        seen.setdefault(key, []).append(f"Analyse — {STATUS_FR[r['status']].lower()}{mode}")
    rows = [[n, v, ", ".join(dict.fromkeys(roles))] for (n, v), roles in seen.items()]
    return Table(["Outil", "Version", "Usage / statut"], rows, [2, 1.5, 3])


def _acquisitions_table(doc: dict, fmt: _Fmt) -> Table:
    rows = [[a["acquisition_id"], a["device_id"], METHOD_FR.get(a["method"], (a["method"],))[0],
             fmt.ts(a["started_at"]), fmt.ts(a.get("ended_at")), a["operator"],
             STATUS_FR.get(a["status"], a["status"])] for a in doc["acquisitions"]]
    return Table(["ID", "Appareil", "Méthode", "Début", "Fin", "Opérateur", "Statut"], rows,
                 [0.8, 0.8, 1.6, 1.3, 1.3, 1.3, 0.8])


def _tool_runs_table(doc: dict, fmt: _Fmt, case_root: Path | None = None) -> Table:
    def cmd(r: dict) -> str:
        text = " ".join(r.get("command") or []) or "—"
        return text.replace(str(case_root.resolve()), "<affaire>") if case_root else text

    rows = [[r["run_id"], f"{r['tool']['name']} {r['tool'].get('version') or ''}".strip(), cmd(r), f"{fmt.ts(r['started_at'])} → {fmt.ts(r.get('ended_at'))}",
             STATUS_FR[r["status"]], _v(r.get("input_evidence_ids")), _v(r.get("output_path")),
             r.get("message") or ""] for r in doc["tool_runs"]]
    return Table(["Exécution", "Outil", "Commande", "Début → fin", "Statut", "Entrées", "Sortie", "Remarque"],
                 rows, [1.1, 0.9, 1.9, 1.5, 0.7, 0.7, 1.0, 1.2])


def _evidence_table(doc: dict, fmt: _Fmt) -> Table:
    rows = [[e["evidence_id"], e["label"], e["local_path"], _size(e.get("size_bytes")), fmt.ts(e["collected_at"]),
             e["collected_by"], e["sha256"]] for e in doc["evidence_items"]]
    return Table(["ID", "Description", "Fichier", "Taille", "Collecte", "Par", "SHA-256"], rows,
                 [0.6, 1.3, 1.5, 0.7, 1.0, 0.9, 2.2], mono_cols=(6,))


def _custody_table(doc: dict, fmt: _Fmt) -> Table:
    rows = []
    for i, c in enumerate(sorted(doc["custody_chain"], key=lambda c: parse_iso(c["timestamp"])), start=1):
        action = CUSTODY_FR.get(c["action"], c["action"])
        if c.get("location"):
            action += f" — {c['location']}"
        if c.get("notes"):
            action += f" ({c['notes']})"
        rows.append([str(i), fmt.ts(c["timestamp"]), c["evidence_id"], action, c["actor"], c["sha256"]])
    return Table(["N°", "Date / heure", "Preuve", "Action", "Responsable", "Empreinte SHA-256"], rows,
                 [0.4, 1.1, 0.6, 2.2, 1.1, 2.3], mono_cols=(5,))


def _timeline_table(c: _Ctx, events: list[dict]) -> Table:
    rows = []
    for t in sorted(events, key=lambda t: parse_iso(t["timestamp"])):
        ev = sorted({c.artifacts[a]["source"]["evidence_id"] for a in t["artifact_ids"] if a in c.artifacts})
        rows.append([c.fmt.ts(t["timestamp"]), CATEGORY_FR.get(t["category"], t["category"]), t["summary"],
                     _corr(t["corroborated"]), ", ".join(t["artifact_ids"]), ", ".join(ev)])
    return Table(["Date / heure", "Type", "Événement", "Fiabilité", "Artefacts", "Preuves"], rows,
                 [1.2, 1.1, 3.0, 0.9, 1.1, 0.7])


def _inventory_table(doc: dict) -> Table:
    """Inventaire par FAIT : un fait extrait par plusieurs outils n'est compté qu'une fois."""
    facts: dict[str, dict[str, set]] = {}
    raw = Counter()
    for a in doc["artifacts"]:
        raw[a["category"]] += 1
        g = facts.setdefault(a["category"], {})
        g.setdefault(a["fact_sha256"], set()).add(artifact_engine(a))
    rows = []
    for cat in sorted(facts, key=lambda k: -len(facts[k])):
        corr = sum(1 for engines in facts[cat].values() if len(engines) >= 2)
        rows.append([CATEGORY_FR.get(cat, cat), str(len(facts[cat])), str(corr), str(raw[cat])])
    rows.append(["Total", str(sum(len(v) for v in facts.values())),
                 str(sum(1 for v in facts.values() for e in v.values() if len(e) >= 2)), str(sum(raw.values()))])
    return Table(["Catégorie", "Faits uniques", "dont corroborés", "Enregistrements (tous outils)"], rows,
                 [2.6, 1, 1, 1.4])


def _sources_table(c: _Ctx, artifact_ids: list[str]) -> Table:
    """Traçabilité d'un constat : artefact → outil/fichier source → preuve hachée."""
    rows = []
    for aid in artifact_ids:
        a = c.artifacts[aid]
        src = a["source"]
        where = _tool_label(src["tool"])
        if src.get("file_path"):
            where += f" · {src['file_path']}"
        if src.get("record_ref"):
            where += f" · {src['record_ref']}"
        ev = c.evidence[src["evidence_id"]]
        rows.append([aid, c.fmt.ts(a.get("timestamp")), artifact_summary(a), where, ev["evidence_id"], ev["sha256"]])
    return Table(["Artefact", "Horodatage", "Contenu", "Outil · fichier · enregistrement", "Preuve",
                  "SHA-256 de la preuve"], rows, [0.9, 1.0, 2.0, 1.8, 0.7, 2.0], mono_cols=(5,))


def _exhibit_blocks(c: _Ctx, exhibits: list[dict]) -> list[Block]:
    if not exhibits:
        return []
    rows = [[x["exhibit_id"], EXHIBIT_FR[x["type"]], x["description"], x["path"], x["sha256"]] for x in exhibits]
    blocks: list[Block] = [Table(["Pièce", "Type", "Description", "Fichier", "SHA-256"], rows,
                                 [0.6, 0.9, 2.3, 1.9, 2.3], mono_cols=(4,))]
    for x in exhibits:
        p = c.resolve(x["path"])
        if x["type"] == "screenshot" and p and p.suffix.lower() in IMAGE_EXT:
            blocks.append(Figure(p, f"{x['exhibit_id']} — {x['description']} (SHA-256 {x['sha256']})"))
    return blocks


def _tool_label(tool: dict) -> str:
    eng = tool.get("engine")
    return tool["name"] + (f" (moteur {eng})" if eng and eng != tool["name"] else "")


def _corroboration_line(c: _Ctx, f: dict) -> str:
    """Fiabilité d'un constat + moteurs d'analyse indépendants qui ont extrait ses faits."""
    engines: set[str] = set()
    for a in f["artifact_ids"]:
        art = c.artifacts.get(a)
        if not art:
            continue
        engines.add(artifact_engine(art))
        for s in art["corroboration"]["sources"]:
            other = c.artifacts.get(s["artifact_id"])
            engines.add(artifact_engine(other) if other else s.get("engine") or s["tool"])
    label = "Corroboré (fiabilité renforcée)" if f["corroborated"] else "Source unique"
    return f"{label} — moteur(s) : {', '.join(sorted(engines)) or '—'}"


def _integrity_blocks(c: _Ctx) -> list[Block]:
    integ = c.doc["integrity"]
    audit = integ.get("audit") or {}
    rows = [
        ("Données sources (JSON normalisé) — SHA-256", c.source_sha),
        ("Généré par", f"{integ['generator']['name']} {integ['generator']['version']}"),
        ("Données consolidées le", c.fmt.ts(integ["generated_at"])),
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
        "à celle ci-dessus. Les versions Markdown et PDF de ce rapport sont produites à partir de ce même fichier.",
        "small"))
    return blocks


def _limitations(doc: dict) -> list[Block]:
    items = list(doc["case"].get("limitations") or [])
    for r in doc["tool_runs"]:
        if r["status"] in ("skipped", "failed"):
            msg = (r.get("message") or "sans détail").rstrip(".")
            items.append(f"{r['tool']['name']} : {STATUS_FR[r['status']].lower()} — {msg}.")
    items.append("Les horodatages proviennent des bases de l'appareil ; ils dépendent de l'exactitude de son "
                 "horloge et peuvent avoir été modifiés par l'utilisateur ou des applications.")
    items.append("Un fait « corroboré » est confirmé par au moins deux outils indépendants à partir des mêmes "
                 "données ; un fait « source unique » n'a été extrait que par un seul outil.")
    return [Bullets(items)]


def _cited_artifacts(c: _Ctx) -> list[str]:
    out: list[str] = []
    for f in c.doc["findings"]:
        out += [a for a in f.get("artifact_ids", []) if a not in out]
    return out


# --------------------------------------------------------------------------- gabarit judiciaire
def _judiciaire(c: _Ctx) -> list[Section]:
    doc, fmt = c.doc, c.fmt
    case = doc["case"]
    auth = case["legal_authorization"]
    verifs = [x for x in doc["custody_chain"] if x["action"] in ("verified", "copied", "hashed")]

    declaration = (
        f"Les opérations décrites dans le présent rapport ont été réalisées en vertu de : "
        f"{BASIS_FR.get(auth['basis'], auth['basis']).lower()}, référence {auth['reference']}"
        + (f", délivré(e) par {auth['issued_by']}" if auth.get("issued_by") else "")
        + (f" le {fmt.date(auth['issued_at'])}" if auth.get("issued_at") else "")
        + f". L'existence et la validité de cette autorisation ont été vérifiées par {auth['verified_by']} "
        f"le {fmt.ts(auth['verified_at'])}, avant toute opération sur l'appareil."
    )

    method_blocks: list[Block] = [
        Subheading("3.1 Outils utilisés et versions"), _tools_inventory(doc),
        Subheading("3.2 Procédure d'acquisition"),
    ]
    used = list(dict.fromkeys(a["method"] for a in doc["acquisitions"]))
    method_blocks.append(Bullets([f"{METHOD_FR[m][0]} : {METHOD_FR[m][1]}" for m in used if m in METHOD_FR]
                                 or ["Aucune acquisition consignée."]))
    method_blocks += [
        _acquisitions_table(doc, fmt),
        Subheading("3.3 Principe de non-altération"),
        Paragraph("L'acquisition est logique : elle utilise les interfaces standard d'Android (ADB) avec "
                  "l'autorisation affichée sur l'appareil, sans modification du système, sans élévation de "
                  "privilèges et sans contournement d'un mécanisme de verrouillage ou d'authentification."),
        Paragraph("Chaque élément collecté est haché (SHA-256) dès sa collecte. Les analyses sont conduites sur "
                  "des copies de travail ; les originaux sont conservés en lecture seule. Les empreintes sont "
                  "recalculées à chaque étape de la chaîne de custody et avant la rédaction du rapport."),
        Paragraph(f"{len(verifs)} contrôle(s) d'empreinte postérieur(s) à la collecte figure(nt) dans la chaîne "
                  "de custody ; tous sont concordants avec l'empreinte d'origine (vérification automatique "
                  "de Veritrace, toute discordance bloquant la production du rapport).", "note"),
        Subheading("3.4 Analyse et corroboration"),
        Paragraph("Les éléments de preuve sont analysés par plusieurs outils. Leurs résultats sont convertis dans "
                  "un format normalisé ; chaque fait reçoit une empreinte calculée sur ses seuls attributs "
                  "identifiants (ex. horodatage, numéro et texte d'un SMS). Un même fait extrait par plusieurs "
                  "outils n'est compté qu'une fois. Lorsqu'au moins deux moteurs d'analyse INDÉPENDANTS l'ont "
                  "extrait, il est qualifié de « corroboré » (fiabilité renforcée). Un outil qui réutilise le "
                  "moteur d'un autre (ex. le module aLEAPP intégré à Autopsy) n'est pas une source indépendante."),
    ]

    findings_blocks: list[Block] = [Paragraph(
        "Pour chaque constat, les faits matériellement observés sont présentés séparément de l'interprétation de "
        "l'examinateur. Chaque fait renvoie à un artefact, lui-même rattaché à un élément de preuve haché.",
        "small")]
    for n, f in enumerate(c.findings, start=1):
        findings_blocks += [
            Subheading(f"Constat n° {n} — {f['title']}"),
            KeyValue([("Référence", f["finding_id"]), ("Fiabilité", _corroboration_line(c, f)),
                      ("Éléments de preuve", _v(f.get("evidence_ids")))]),
            Label("Faits constatés"), Paragraph(f["description"]),
            Label("Sources et empreintes"), _sources_table(c, f["artifact_ids"]),
        ]
        ex = _exhibit_blocks(c, f.get("exhibits") or [])
        if ex:
            findings_blocks += [Label("Captures et références")] + ex
        findings_blocks += [Label("Interprétation de l'examinateur"),
                            Paragraph(f.get("interpretation") or "Aucune interprétation n'est formulée.",
                                      "interpretation")]
    if not doc["findings"]:
        findings_blocks.append(Paragraph("Aucun constat n'a été retenu à l'issue de l'analyse."))

    cited = _cited_artifacts(c)
    cited_rows = [[a, CATEGORY_FR.get(c.artifacts[a]["category"], ""), artifact_summary(c.artifacts[a]),
                   c.artifacts[a]["content_sha256"]] for a in cited]

    return [
        Section("1. Déclaration d'autorisation", [
            Paragraph(declaration),
            KeyValue([("Base légale", BASIS_FR.get(auth["basis"], auth["basis"])),
                      ("Référence", auth["reference"]),
                      ("Délivrée par", _v(auth.get("issued_by"))),
                      ("Date", fmt.ts(auth.get("issued_at"))),
                      ("Périmètre autorisé", _v(auth.get("scope"))),
                      ("Empreinte du document d'autorisation", _v(auth.get("document_sha256")))]),
            Subheading("Objet de la mission"),
            Paragraph(case.get("mission") or "Non précisé."),
        ]),
        Section("2. Matériel examiné", [_devices_table(doc)] + [
            Paragraph(f"{d['device_id']} — état à réception : {d['state_on_receipt']}", "small")
            for d in doc["devices"] if d.get("state_on_receipt")]),
        Section("3. Méthodologie", method_blocks),
        Section("4. Éléments de preuve", [_evidence_table(doc, fmt)]),
        Section("5. Chaîne de custody", [_custody_table(doc, fmt)]),
        Section("6. Constatations", findings_blocks),
        Section("7. Chronologie consolidée", [
            Paragraph(f"Heures exprimées dans le fuseau {fmt.tz_label}.", "small"),
            _timeline_table(c, doc["timeline"])]),
        Section("8. Limites et réserves", _limitations(doc)),
        Section("9. Attestation", [
            Paragraph("Je soussigné(e), certifie avoir personnellement accompli les opérations décrites dans le "
                      "présent rapport, dans les limites de l'autorisation mentionnée en section 1, et que les "
                      "constatations qui y figurent sont exactes et sincères au regard des éléments examinés."),
            Paragraph(f"Le présent rapport est établi à partir des données d'empreinte SHA-256 {c.source_sha}.",
                      "small"),
            Signature([e["name"] + (f" — {e['role']}" if e.get("role") else "") for e in case["examiners"]]
                      + ["Fait à ____________________, le ____ / ____ / ________", "Signature :"]),
        ]),
        Section("Annexe A — Détails techniques des exécutions d'outils", [_tool_runs_table(doc, fmt, c.case_root)], new_page=True),
        Section("Annexe B — Artefacts", [
            Subheading("Artefacts cités et empreintes de contenu"),
            Table(["Artefact", "Catégorie", "Contenu", "Empreinte du contenu (SHA-256)"], cited_rows,
                  [0.7, 1.1, 3.0, 2.4], mono_cols=(3,)),
            Subheading("Inventaire par catégorie"), _inventory_table(doc)]),
        Section("Annexe C — Intégrité du rapport et journal d'audit", _integrity_blocks(c)),
        Section("Annexe D — Glossaire", [Table(["Terme", "Définition"], [[t, d] for t, d in GLOSSARY], [1.4, 4])]),
    ]


# --------------------------------------------------------------------------- gabarit entreprise
def _remediation_rows(c: _Ctx) -> list[list[str]]:
    items: list[tuple[int, int, list[str]]] = []
    default_prio = {"critical": "immediate", "high": "short_term"}
    for f in c.findings:
        actions = list(f.get("remediation") or [])
        if not actions and f.get("recommendation"):
            actions = [{"action": f["recommendation"], "priority": default_prio.get(f["severity"], "medium_term")}]
        for a in actions:
            items.append((PRIORITY_ORDER.index(a["priority"]), SEVERITY_ORDER.index(f["severity"]),
                          [PRIORITY_FR[a["priority"]], a["action"], a.get("owner") or "À désigner",
                           a.get("due_date") or "—", f"{f['finding_id']} ({SEVERITY_FR[f['severity']]})"]))
    items.sort(key=lambda x: (x[0], x[1]))
    return [[str(i)] + row for i, (_, _, row) in enumerate(items, start=1)]


def _entreprise(c: _Ctx) -> list[Section]:
    doc, fmt = c.doc, c.fmt
    case = doc["case"]
    sev = Counter(f["severity"] for f in doc["findings"])
    worst = next((s for s in SEVERITY_ORDER if sev[s]), None)
    risk = SEVERITY_FR[worst].upper() if worst and worst != "info" else "FAIBLE / AUCUN RISQUE IDENTIFIÉ"
    start, end = _operations_period(doc)

    auto_summary = (f"L'examen de {len(doc['devices'])} appareil(s) a conduit à {len(doc['findings'])} constat(s) : "
                    + (", ".join(f"{sev[s]} {SEVERITY_FR[s].lower()}" for s in SEVERITY_ORDER if sev[s]) or "aucun")
                    + ".")
    key_points = [f"[{SEVERITY_FR[f['severity']]}] {f.get('plain_summary') or f['title']}" for f in c.findings[:5]]
    if len(c.findings) > 5:
        key_points.append(f"… et {len(c.findings) - 5} autre(s) constat(s) détaillé(s) en section 2.")
    rem = _remediation_rows(c)
    immediate = [r[2] for r in rem if r[1] == PRIORITY_FR["immediate"]]

    tech: list[Block] = []
    for n, f in enumerate(c.findings, start=1):
        tech += [
            Subheading(f"{f['finding_id']} — {f['title']}"),
            KeyValue([("Criticité", SEVERITY_FR[f["severity"]]), ("Fiabilité", _corroboration_line(c, f))]
                     + ([("Confiance", CONFIDENCE_FR[f["confidence"]])] if f.get("confidence") else [])),
            Label("Faits constatés"), Paragraph(f["description"]),
        ]
        if f.get("interpretation"):
            tech += [Label("Analyse"), Paragraph(f["interpretation"], "interpretation")]
        tech += [Label("Sources"), _sources_table(c, f["artifact_ids"])] if f["artifact_ids"] else []

    exhibits = [x for f in c.findings for x in (f.get("exhibits") or [])]
    flagged = [t for t in doc["timeline"] if t.get("flags")]

    return [
        Section("1. Résumé exécutif", [
            KeyValue([("Niveau de risque global", risk),
                      ("Constats", ", ".join(f"{SEVERITY_FR[s]} : {sev[s]}" for s in SEVERITY_ORDER if sev[s]) or "0"),
                      ("Périmètre", ", ".join(f"{d['manufacturer']} {d['model']}" for d in doc["devices"]) or "—"),
                      ("Période d'examen", f"{fmt.date(start)} → {fmt.date(end)}" if start else "—")]),
            Paragraph(case.get("executive_summary") or auto_summary),
            Subheading("Ce qu'il faut retenir"),
            Bullets(key_points or ["Aucun constat significatif."]),
            Subheading("Décisions attendues à court terme"),
            Bullets(immediate or ["Aucune action immédiate requise."]),
        ]),
        Section("2. Criticité des constats", [
            Table(["N°", "Constat", "Criticité", "Fiabilité", "Impact"],
                  [[f["finding_id"], f["title"], SEVERITY_FR[f["severity"]], _corr(f["corroborated"]),
                    f.get("business_impact") or "—"] for f in c.findings], [0.6, 2.8, 0.8, 0.9, 2.4]),
            Subheading("Échelle de criticité"),
            Table(["Niveau", "Signification"], [[SEVERITY_FR[s], SEVERITY_MEANING[s]] for s in SEVERITY_ORDER[:4]],
                  [1, 5]),
        ], new_page=True),
        Section("3. Recommandations et plan de remédiation", [
            Table(["#", "Priorité", "Action", "Responsable", "Échéance", "Constat"], rem,
                  [0.3, 1.1, 3.2, 1.1, 0.8, 1.0]) if rem else Paragraph("Aucune action de remédiation proposée."),
        ]),
        Section("4. Détails techniques", tech + [
            Subheading("Chronologie des événements clés"),
            Paragraph(f"Heures exprimées dans le fuseau {fmt.tz_label}.", "small"),
            _timeline_table(c, flagged) if flagged else Paragraph("Aucun événement signalé."),
            Subheading("Périmètre et méthodologie"),
            KeyValue([("Cadre", f"{BASIS_FR.get(case['legal_authorization']['basis'])} — réf. "
                                f"{case['legal_authorization']['reference']}"),
                      ("Périmètre autorisé", _v(case["legal_authorization"].get("scope")))]),
            _devices_table(doc), _tools_inventory(doc),
        ], new_page=True),
        Section("5. Limites", _limitations(doc)),
        Section("Annexe — Preuves", [
            Subheading("Éléments de preuve"), _evidence_table(doc, fmt),
            Subheading("Chaîne de custody"), _custody_table(doc, fmt),
            Subheading("Pièces (captures, exports)"),
            *(_exhibit_blocks(c, exhibits) or [Paragraph("Aucune pièce jointe.")]),
            Subheading("Inventaire des artefacts"), _inventory_table(doc),
            Subheading("Intégrité du rapport"), *_integrity_blocks(c),
        ], new_page=True),
    ]


# --------------------------------------------------------------------------- point d'entrée
def check_template_requirements(doc: dict[str, Any], template: str) -> list[str]:
    """Exigences propres au gabarit, au-delà de la conformité au schéma."""
    problems: list[str] = []
    if template == "judiciaire":
        for f in doc["findings"]:
            if not f.get("artifact_ids"):
                problems.append(f"{f['finding_id']} : aucun artefact à l'appui — toute affirmation du rapport "
                                "judiciaire doit être traçable à une preuve hachée.")
    return problems


def build_report_model(doc: dict[str, Any], template: str, *, source_sha256: str,
                       case_root: Path | None = None) -> ReportModel:
    """`doc` DOIT avoir été validé au préalable (voir reporting.generate)."""
    if template not in TEMPLATES:
        raise ValueError(f"Gabarit inconnu « {template} » (choix : {', '.join(TEMPLATES)})")
    problems = check_template_requirements(doc, template)
    if problems:
        raise ReportPrecheckError(f"Gabarit {template} : " + " ; ".join(problems))
    c = _Ctx(doc, _Fmt(doc["case"].get("display_timezone")), source_sha256, case_root)
    sections = _judiciaire(c) if template == "judiciaire" else _entreprise(c)
    return ReportModel(template=template, cover=_cover(c, template), sections=sections, footer=CREDIT_LINE,
                       source_sha256=source_sha256, generated_at=utc_now_iso())
