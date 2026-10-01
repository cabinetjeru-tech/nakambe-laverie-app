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
from veritrace.core.authorization import LEGAL_BASES
from veritrace.schema.describe import RECOVERY_METHOD_FR, RECOVERY_STATUS_FR, artifact_summary  # noqa: F401
from veritrace.schema.pivot import PRIORITIES, SEVERITIES, engine, ext, fact_sha, items_index, iter_items, recovery

TEMPLATES = ("judiciaire", "entreprise")

SEVERITY_ORDER = list(SEVERITIES)
SEVERITY_FR = {"critique": "Critique", "eleve": "Élevé", "moyen": "Moyen", "faible": "Faible", "info": "Information"}
SEVERITY_MEANING = {
    "critique": "Compromission avérée ou exposition majeure — action immédiate requise.",
    "eleve": "Risque sérieux, exploitation probable — traitement sous quelques jours.",
    "moyen": "Risque réel mais limité ou non confirmé — traitement planifié.",
    "faible": "Écart mineur, impact faible — amélioration recommandée.",
    "info": "Observation sans risque identifié.",
}
PRIORITY_ORDER = list(PRIORITIES)
PRIORITY_FR = {"immediat": "Immédiat (< 48 h)", "court_terme": "Court terme (< 30 j)",
               "moyen_terme": "Moyen terme (< 90 j)"}
CONFIDENCE_FR = {"elevee": "élevée", "moyenne": "moyenne", "faible": "faible"}
BASIS_FR = dict(LEGAL_BASES)
CATEGORY_FR = {
    "sms": "SMS / MMS", "appel": "Appels (téléphonie et messageries)", "message": "Messageries tierces",
    "contact": "Contacts", "navigation": "Historique de navigation",
    "localisation": "Géolocalisation", "exif": "Métadonnées EXIF", "usage_app": "Usage des applications",
    "application": "Applications installées", "wifi": "Réseaux Wi-Fi", "bluetooth": "Appareils Bluetooth",
    "compte": "Comptes", "ioc": "Correspondances IOC", "autre": "Autres",
}
STATUS_FR = {"succes": "Succès", "avertissement": "Avertissement", "echec": "Échec", "ignore": "Non exécuté",
             "partiel": "Partiel"}
CUSTODY_FR = {"collecte": "Collecte", "verification": "Vérification", "copie": "Copie", "transfert": "Transfert",
              "stockage": "Stockage", "analyse": "Analyse", "rapport": "Rapport", "scelle": "Mise sous scellé",
              "restitution": "Restitution"}
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
    "adb_package_list": ("Liste des applications (adb shell pm list packages)",
                         "Inventaire des paquets installés avec leur chemin, leur installateur et leur UID."),
    "adb_getprop": ("Propriétés système (adb shell getprop)",
                    "Lecture des propriétés d'identification de l'appareil (modèle, version, empreinte de build)."),
    "import": ("Import", "Élément remis à Veritrace (extraction, base Autopsy, fichier d'IOC) : haché à "
                         "l'import et conservé tel quel."),
}
EXHIBIT_FR = {"capture": "Capture d'écran", "export": "Export", "document": "Document", "autre": "Autre"}
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
    ("Corroboré", "Fait extrait par au moins deux moteurs d'analyse indépendants (même empreinte de fait)."),
    ("Règle de détection", "Contrôle automatique appliqué aux données normalisées (R1 à R6) ; ses constats sont des "
     "signalements à apprécier par l'examinateur."),
    ("Empreinte SHA-256", "Valeur de 64 caractères calculée à partir d'un contenu. La moindre modification du "
     "contenu produit une empreinte totalement différente : elle permet d'en vérifier l'intégrité."),
    ("IMEI", "International Mobile Equipment Identity — identifiant unique d'un terminal mobile."),
    ("IOC (indicateur de compromission)", "Élément technique (nom de paquet, domaine, empreinte…) associé à un "
     "logiciel malveillant connu."),
    ("MVT", "Mobile Verification Toolkit (Amnesty International) — détection de logiciels espions par IOC."),
    ("Paquet (package)", "Identifiant technique unique d'une application Android (ex. com.exemple.app)."),
    ("Sideload", "Installation d'une application hors magasin officiel, à partir d'un fichier APK."),
    ("Bloc libre / page libre", "Zones d'une base SQLite libérées par une suppression ; tant qu'elles ne sont pas "
     "réutilisées, elles peuvent conserver le contenu des enregistrements supprimés."),
    ("Journal WAL / journal de rollback", "Fichiers annexes d'une base SQLite (-wal, -journal) conservant des versions "
     "de pages avant ou après modification ; ils peuvent contenir des enregistrements depuis supprimés."),
    ("Effacement sécurisé (secure_delete)", "Option de SQLite, activée dans la bibliothèque d'Android, qui remet à "
     "zéro le contenu supprimé : les suppressions ne sont alors plus récupérables dans la base elle-même."),
    ("Enregistrement récupéré", "Enregistrement lu hors des données actives d'une base : « absent » (supprimé ou "
     "remplacé) ou « version antérieure » d'une ligne encore présente."),
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
        self.evidence = items_index(self.doc)
        self.case_x = ext(self.doc["case"])
        self.runs = (self.doc.get("x_veritrace") or {}).get("tool_runs") or []
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
    v = f"Android {d['os_version']}" if d.get("os_version") else "Android (version inconnue)"
    return v + (f" — correctif {d['security_patch']}" if d.get("security_patch") else "")


def _operations_period(doc: dict) -> tuple[str | None, str | None]:
    stamps: list[str] = []
    for a in doc["acquisitions"]:
        stamps += [a["started_at"]] + ([a["ended_at"]] if a.get("ended_at") else [])
    for r in (doc.get("x_veritrace") or {}).get("tool_runs") or []:
        stamps += [r["started_at"]] + ([r["ended_at"]] if r.get("ended_at") else [])
    stamps += [c["timestamp"] for c in doc["chain_of_custody"]]
    if not stamps:
        return None, None
    parsed = sorted(stamps, key=lambda s: parse_iso(s))
    return parsed[0], parsed[-1]


# --------------------------------------------------------------------------- blocs réutilisables
def _cover(c: _Ctx, template: str) -> Cover:
    doc, fmt = c.doc, c.fmt
    case = doc["case"]
    org = c.case_x.get("organization") or {"name": "Cabinet (à renseigner)"}
    auth = case["authorization"]
    rp = c.case_x.get("requesting_party") or {}
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
        ("Examinateur", _examiner(c)),
        ("Ouverture de l'affaire", fmt.ts(case["created_at"])),
        ("Période des opérations", f"du {fmt.ts(start)} au {fmt.ts(end)}" if start else "—"),
        ("Date du rapport", fmt.ts(utc_now_iso())),
        ("Autorisation", f"{BASIS_FR.get(auth['type'], auth['type'])} — réf. {auth['reference']}"),
        ("Fuseau horaire des dates", fmt.tz_label),
        ("Empreinte des données sources", c.source_sha),
    ]
    d = doc["device"]
    devices = Table(["Marque", "Modèle", "IMEI", "Système"],
                    [[_v(d.get("manufacturer")), _v(d.get("model")), _v(d.get("imei")), _os(d)]], [1, 1.8, 1.6, 2])
    return Cover(title, case["title"], case["case_id"], org["name"], org_lines,
                 c.resolve(org.get("logo_path")), meta, devices, conf)


def _examiner(c: "_Ctx") -> str:
    role = c.case_x.get("examiner_role")
    return c.doc["case"]["examiner"] + (f" — {role}" if role else "")


def _devices_table(doc: dict) -> Table:
    d = doc["device"]
    rows = [[_v(d.get("manufacturer")), _v(d.get("model")), _os(d), _v(d.get("imei")), _v(d.get("serial")),
             _v(d.get("seal_number"))]]
    return Table(["Marque", "Modèle", "Système", "IMEI", "N° série", "Scellé"], rows, [0.9, 1.5, 1.8, 1.4, 1.1, 1.1])


def _tools_inventory(doc: dict) -> Table:
    """Outils + versions (acquisition et analyse), dédoublonnés."""
    seen: dict[tuple[str, str], list[str]] = {}
    for a in doc["acquisitions"]:
        t = a.get("tool") or {}
        if t.get("name"):
            role = "Import et hachage" if a["method"] == "import" else "Acquisition"
            seen.setdefault((t["name"], t.get("version") or "non déterminée"), []).append(role)
    for r in (doc.get("x_veritrace") or {}).get("tool_runs") or []:
        key = (r["tool"], r.get("tool_version") or "non déterminée")
        mode = {"execute": ", exécuté par Veritrace", "importe": ", sortie importée"}.get(r.get("mode") or "", "")
        seen.setdefault(key, []).append(f"Analyse — {STATUS_FR[r['status']].lower()}{mode}")
    rows = [[n, v, ", ".join(dict.fromkeys(roles))] for (n, v), roles in seen.items()]
    return Table(["Outil", "Version", "Usage / statut"], rows, [2, 1.5, 3])


def _acquisitions_table(doc: dict, fmt: _Fmt) -> Table:
    rows = [[a["acquisition_id"], METHOD_FR.get(a["method"], (a["method"],))[0], fmt.ts(a["started_at"]),
             fmt.ts(a.get("ended_at")), a["operator"], STATUS_FR.get(a["status"], a["status"]),
             ", ".join(i["item_id"] for i in a.get("items") or []) or "—"] for a in doc["acquisitions"]]
    return Table(["ID", "Méthode", "Début", "Fin", "Opérateur", "Statut", "Éléments"], rows,
                 [0.7, 1.7, 1.2, 1.2, 1.2, 0.8, 1.0])


def _tool_runs_table(doc: dict, fmt: _Fmt, case_root: Path | None = None) -> Table:
    def cmd(r: dict) -> str:
        text = " ".join(r.get("command") or []) or "—"
        return text.replace(str(case_root.resolve()), "<affaire>") if case_root else text

    runs = (doc.get("x_veritrace") or {}).get("tool_runs") or []
    rows = [[r["run_id"], f"{r['tool']} {r.get('tool_version') or ''}".strip(), cmd(r),
             f"{fmt.ts(r['started_at'])} → {fmt.ts(r.get('ended_at'))}", STATUS_FR[r["status"]],
             _v(r.get("input_item_ids")), _v(r.get("output_path")), r.get("message") or ""] for r in runs]
    return Table(["Exécution", "Outil", "Commande", "Début → fin", "Statut", "Entrées", "Sortie", "Remarque"],
                 rows, [1.1, 0.9, 1.9, 1.5, 0.7, 0.7, 1.0, 1.2])


def _evidence_table(doc: dict, fmt: _Fmt) -> Table:
    rows = [[e["item_id"], acq["acquisition_id"], e["label"], e["path"], _size(e.get("size_bytes")),
             fmt.ts(e["collected_at"]), e["sha256"]] for acq, e in iter_items(doc)]
    return Table(["ID", "Acq.", "Description", "Fichier", "Taille", "Collecte", "SHA-256"], rows,
                 [0.6, 0.6, 1.3, 1.5, 0.7, 1.0, 2.2], mono_cols=(6,))


def _custody_table(doc: dict, fmt: _Fmt) -> Table:
    rows = []
    for i, c in enumerate(sorted(doc["chain_of_custody"], key=lambda c: parse_iso(c["timestamp"])), start=1):
        action = CUSTODY_FR.get(c["action"], c["action"])
        if c.get("location"):
            action += f" — {c['location']}"
        if c.get("notes"):
            action += f" ({c['notes']})"
        rows.append([str(i), fmt.ts(c["timestamp"]), c["item_id"], action, c["actor"], c["sha256"]])
    return Table(["N°", "Date / heure", "Preuve", "Action", "Responsable", "Empreinte SHA-256"], rows,
                 [0.4, 1.1, 0.6, 2.2, 1.1, 2.3], mono_cols=(5,))


def _timeline_table(c: _Ctx, events: list[dict]) -> Table:
    rows = []
    for t in sorted(events, key=lambda t: parse_iso(t["timestamp"])):
        ev = sorted({c.artifacts[a]["source"]["item_id"] for a in t["artifact_ids"] if a in c.artifacts})
        rows.append([c.fmt.ts(t["timestamp"]), CATEGORY_FR.get(t["category"], t["category"]), t["description"],
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
        g.setdefault(fact_sha(a), set()).add(engine(a))
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
        where = _tool_label(a)
        if src.get("file_path"):
            where += f" · {src['file_path']}"
        if src.get("record_ref"):
            where += f" · {src['record_ref']}"
        ev = c.evidence[src["item_id"]]
        rows.append([aid, c.fmt.ts(a.get("timestamp")), artifact_summary(a), where, ev["item_id"], ev["sha256"]])
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
        if x["type"] == "capture" and p and p.suffix.lower() in IMAGE_EXT:
            blocks.append(Figure(p, f"{x['exhibit_id']} — {x['description']} (SHA-256 {x['sha256']})"))
    return blocks


def _tool_label(a: dict) -> str:
    name, eng = a["source"]["tool"], engine(a)
    return name + (f" (moteur {eng})" if eng != name else "")


def _corroboration_line(c: _Ctx, f: dict) -> str:
    """Fiabilité d'un constat + moteurs d'analyse indépendants qui ont extrait ses faits."""
    engines: set[str] = set()
    for a in f["artifact_ids"]:
        art = c.artifacts.get(a)
        if not art:
            continue
        engines.add(engine(art))
        for s in ext(art).get("sources") or []:
            other = c.artifacts.get(s["artifact_id"])
            engines.add(engine(other) if other else s.get("engine") or s["tool"])
    label = "Corroboré (fiabilité renforcée)" if f["corroborated"] else "Source unique"
    return f"{label} — moteur(s) : {', '.join(sorted(engines)) or '—'}"


def is_generated(f: dict) -> bool:
    """Constat produit automatiquement (règle Veritrace ou outil), par opposition à l'examinateur."""
    return bool(ext(f).get("rule_id")) or (f.get("source_tool") or "examinateur").lower() != "examinateur"


def interpretation_label(f: dict) -> str:
    x = ext(f)
    if not is_generated(f) or x.get("reviewed"):
        return "Interprétation de l'examinateur"
    origin = f"règle {x['rule_id']}" if x.get("rule_id") else (f.get("source_tool") or "outil")
    return f"Interprétation proposée automatiquement ({origin}) — non revue par l'examinateur"


def _origin_row(f: dict) -> list[tuple[str, str]]:
    """Origine du constat ; un constat généré automatiquement est signalé comme tel."""
    x = ext(f)
    if x.get("rule_id"):
        state = "revu par l'examinateur" if x.get("reviewed") else "généré automatiquement, non revu par l'examinateur"
        return [("Origine", f"Règle {x['rule_id']} v{x.get('rule_version', '?')} — {state}")]
    if is_generated(f):
        state = "revu par l'examinateur" if ext(f).get("reviewed") else "non revu par l'examinateur"
        return [("Origine", f"{f.get('source_tool')} — {state}")]
    return [("Origine", "Examinateur")]


def _rules_blocks(doc: dict) -> list[Block]:
    applied = (doc.get("x_veritrace") or {}).get("rules_applied") or []
    if not applied:
        return [Paragraph("Aucune règle de détection automatique n'a été évaluée.", "small")]
    rows = [[r["rule_id"], r["title"], r.get("description") or "", f"v{r['version']}",
             "appliquée" if r["enabled"] else "désactivée", str(r["hits"])] for r in applied]
    params = applied[0].get("parameters") or {}
    blocks: list[Block] = [
        Paragraph("Des règles de détection automatique sont appliquées aux données normalisées. Leurs constats "
                  "sont des signalements à apprécier : chacun indique sa règle d'origine et s'il a été revu par "
                  "l'examinateur."),
        Table(["Règle", "Objet", "Critère", "Version", "État", "Constats"], rows, [0.5, 1.5, 2.8, 0.6, 0.8, 0.8])]
    if params:
        blocks.append(Paragraph("Paramètres : " + ", ".join(f"{k} = {v:g}" for k, v in params.items()) + ".", "small"))
    return blocks


def _ioc_row(f: dict) -> list[tuple[str, str]]:
    ioc = f.get("ioc")
    if not ioc:
        return []
    from veritrace.schema.describe import IOC_TYPE_FR
    text = f"{IOC_TYPE_FR.get(ioc['type'], ioc['type'])} « {ioc['value']} » — fichier {ioc['source']}"
    return [("IOC correspondant", text + (f" — famille {ioc['family']}" if ioc.get("family") else ""))]


def _integrity_blocks(c: _Ctx) -> list[Block]:
    integ = (c.doc.get("x_veritrace") or {}).get("integrity") or {}
    audit = integ.get("audit") or {}
    gen = integ.get("generator") or {}
    rows = [("Données sources (JSON pivot) — SHA-256", c.source_sha)]
    if gen:
        rows.append(("Généré par", f"{gen.get('name', '')} {gen.get('version', '')}".strip()))
    if integ.get("generated_at"):
        rows.append(("Données consolidées le", c.fmt.ts(integ["generated_at"])))
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
    items = list(ext(doc["case"]).get("limitations") or [])
    for r in (doc.get("x_veritrace") or {}).get("tool_runs") or []:
        if r["status"] in ("ignore", "echec"):
            msg = (r.get("message") or "sans détail").rstrip(".")
            items.append(f"{r['tool']} : {STATUS_FR[r['status']].lower()} — {msg}.")
    items.append("Les horodatages proviennent des bases de l'appareil ; ils dépendent de l'exactitude de son "
                 "horloge et peuvent avoir été modifiés par l'utilisateur ou des applications.")
    items.append("Un fait « corroboré » est confirmé par au moins deux outils indépendants à partir des mêmes "
                 "données ; un fait « source unique » n'a été extrait que par un seul outil.")
    if (doc.get("x_veritrace") or {}).get("recovery"):
        items.append("Enregistrements récupérés : la date de suppression n'est jamais connue (seul l'horodatage propre "
                     "à l'enregistrement l'est) ; un enregistrement récupéré n'est corroboré par aucun autre outil. "
                     "L'absence de résultat ne prouve pas l'absence de suppression : sur Android, l'effacement "
                     "sécurisé de SQLite et l'auto-vacuum effacent la plupart des contenus supprimés.")
    return [Bullets(items)]


# --------------------------------------------------------------------------- récupération
def _recovery_blocks(c: "_Ctx") -> list[Block]:
    stats = (c.doc.get("x_veritrace") or {}).get("recovery") or []
    if not stats:
        return [Paragraph("Aucune récupération d'enregistrements supprimés n'a été conduite.", "small")]
    rows = []
    for s in stats:
        wal = f"{s.get('wal_frames', 0)} trame(s)" if s.get("wal_frames") else "absent"
        journal = f"{s.get('journal_pages', 0)} page(s)" if s.get("journal") else "absent"
        rows.append([s["database"], str(s.get("pages", "—")), wal, journal, str(s.get("freelist_pages", 0)),
                     "oui" if s.get("secure_delete_observed") else "non",
                     str(s.get("recovered_absent", 0)), str(s.get("recovered_previous", 0))])
    return [
        Paragraph("Les bases SQLite ont été relues octet par octet sur une copie, sans passer par le moteur SQLite, "
                  "pour rechercher les enregistrements qui ne figurent plus parmi leurs données actives : anciennes "
                  "versions de pages conservées dans les journaux WAL et de rollback, pages libres, espace non alloué "
                  "et blocs libres des pages de table. Chaque enregistrement retrouvé est normalisé comme une ligne "
                  "active puis comparé aux données actives : identique, il est écarté ; même identifiant de ligne et "
                  "contenu différent, il est qualifié de « version antérieure » ; sinon d'« absent des données "
                  "actives » (supprimé, ou remplacé par une modification)."),
        Paragraph("Fiabilité de lecture : élevée pour une cellule intacte située dans une page de la table (journal, "
                  "WAL, espace non alloué) ; moyenne pour une cellule dont l'en-tête a été partiellement écrasé "
                  "(bloc libre), attribuée à sa table par sa seule structure (page libre) ou provenant d'une trame "
                  "WAL non validée ; abaissée d'un niveau si le contenu est incomplet.", "small"),
        Table(["Base", "Pages", "WAL", "Journal", "Pages libres", "Effacement sécurisé constaté",
               "Absents", "Versions antérieures"], rows, [2.4, 0.5, 0.7, 0.7, 0.6, 0.8, 0.6, 0.7]),
    ]


def _recovered_table(c: "_Ctx") -> Table | Paragraph:
    arts = [a for a in c.doc["artifacts"] if recovery(a)]
    if not arts:
        return Paragraph("Aucun enregistrement récupéré.", "small")
    arts.sort(key=lambda a: (a.get("timestamp") is None, a.get("timestamp") or "", a["artifact_id"]))
    rows = []
    for a in arts:
        r = recovery(a)
        where = f"{r['database']} · table {r['table']}" + (f" · ligne {r['rowid']}" if r.get("rowid") is not None else "")
        where += " · " + "; ".join(r["locations"])
        rows.append([a["artifact_id"], c.fmt.ts(a.get("timestamp")), artifact_summary(a),
                     RECOVERY_STATUS_FR[r["status"]], where,
                     CONFIDENCE_FR[r["confidence"]] + (" (incomplet)" if r.get("truncated") else "")])
    return Table(["Artefact", "Horodatage", "Contenu", "Statut", "Base · emplacement(s)", "Fiabilité"], rows,
                 [0.8, 1.0, 2.2, 0.9, 2.2, 0.7])


def _cited_artifacts(c: _Ctx) -> list[str]:
    out: list[str] = []
    for f in c.doc["findings"]:
        out += [a for a in f.get("artifact_ids", []) if a not in out]
    return out


# --------------------------------------------------------------------------- gabarit judiciaire
def _judiciaire(c: _Ctx) -> list[Section]:
    doc, fmt = c.doc, c.fmt
    case = doc["case"]
    auth = case["authorization"]
    ax = ext(auth)
    verifs = [x for x in doc["chain_of_custody"] if x["action"] in ("verification", "copie")]

    declaration = (
        f"Les opérations décrites dans le présent rapport ont été réalisées en vertu de : "
        f"{BASIS_FR.get(auth['type'], auth['type']).lower()}, référence {auth['reference']}"
        + (f", délivré(e) par {ax['issued_by']}" if ax.get("issued_by") else "")
        + (f" le {fmt.date(ax['issued_at'])}" if ax.get("issued_at") else "")
        + f". L'existence et la validité de cette autorisation ont été confirmées par {auth['confirmed_by']} "
        f"le {fmt.ts(auth['confirmed_at'])}, avant toute opération sur l'appareil."
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
        Subheading("3.5 Règles de détection appliquées"),
        *_rules_blocks(doc),
        Subheading("3.6 Récupération des enregistrements supprimés"),
        *_recovery_blocks(c),
    ]

    findings_blocks: list[Block] = [Paragraph(
        "Pour chaque constat, les faits matériellement observés sont présentés séparément de l'interprétation de "
        "l'examinateur. Chaque fait renvoie à un artefact, lui-même rattaché à un élément de preuve haché.",
        "small")]
    for n, f in enumerate(c.findings, start=1):
        findings_blocks += [
            Subheading(f"Constat n° {n} — {f['title']}"),
            KeyValue([("Référence", f["finding_id"]), ("Fiabilité", _corroboration_line(c, f)),
                      ("Éléments de preuve", _v(f.get("item_ids")))] + _origin_row(f) + _ioc_row(f)),
            Label("Faits constatés"), Paragraph(f["description"]),
            Label("Sources et empreintes"), _sources_table(c, f["artifact_ids"]),
        ]
        ex = _exhibit_blocks(c, ext(f).get("exhibits") or [])
        if ex:
            findings_blocks += [Label("Captures et références")] + ex
        findings_blocks += [Label(interpretation_label(f)),
                            Paragraph(ext(f).get("interpretation") or "Aucune interprétation n'est formulée.",
                                      "interpretation")]
    if not doc["findings"]:
        findings_blocks.append(Paragraph("Aucun constat n'a été retenu à l'issue de l'analyse."))

    cited = _cited_artifacts(c)
    cited_rows = [[a, CATEGORY_FR.get(c.artifacts[a]["category"], ""), artifact_summary(c.artifacts[a]),
                   c.artifacts[a]["sha256"]] for a in cited]

    return [
        Section("1. Déclaration d'autorisation", [
            Paragraph(declaration),
            KeyValue([("Base légale", BASIS_FR.get(auth["type"], auth["type"])),
                      ("Référence", auth["reference"]),
                      ("Délivrée par", _v(ax.get("issued_by"))),
                      ("Date", fmt.ts(ax.get("issued_at"))),
                      ("Périmètre autorisé", _v(ax.get("scope"))),
                      ("Empreinte du document d'autorisation", _v(ax.get("document_sha256"))),
                      ("Confirmée par / le", f"{auth['confirmed_by']} — {fmt.ts(auth['confirmed_at'])}")]),
            Subheading("Objet de la mission"),
            Paragraph(c.case_x.get("mission") or "Non précisé."),
        ]),
        Section("2. Matériel examiné", [_devices_table(doc)] + (
            [Paragraph(f"État à réception : {doc['device']['state_on_receipt']}", "small")]
            if doc["device"].get("state_on_receipt") else [])),
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
            Signature([_examiner(c), "Fait à ____________________, le ____ / ____ / ________", "Signature :"]),
        ]),
        Section("Annexe A — Détails techniques des exécutions d'outils", [_tool_runs_table(doc, fmt, c.case_root)], new_page=True),
        Section("Annexe B — Artefacts", [
            Subheading("Artefacts cités et empreintes de contenu"),
            Table(["Artefact", "Catégorie", "Contenu", "Empreinte du contenu (SHA-256)"], cited_rows,
                  [0.7, 1.1, 3.0, 2.4], mono_cols=(3,)),
            Subheading("Inventaire par catégorie"), _inventory_table(doc),
            Subheading("Enregistrements récupérés hors des données actives"), _recovered_table(c)]),
        Section("Annexe C — Intégrité du rapport et journal d'audit", _integrity_blocks(c)),
        Section("Annexe D — Glossaire", [Table(["Terme", "Définition"], [[t, d] for t, d in GLOSSARY], [1.4, 4])]),
    ]


# --------------------------------------------------------------------------- gabarit entreprise
def _remediation_rows(c: _Ctx) -> list[list[str]]:
    items: list[tuple[int, int, list[str]]] = []
    for f in c.findings:
        for a in ext(f).get("remediation") or []:
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

    dev = doc["device"]
    device_label = " ".join(x for x in (dev.get("manufacturer"), dev.get("model")) if x) or "—"
    auto_summary = (f"L'examen de l'appareil {device_label} a conduit à {len(doc['findings'])} constat(s) : "
                    + (", ".join(f"{sev[s]} {SEVERITY_FR[s].lower()}" for s in SEVERITY_ORDER if sev[s]) or "aucun")
                    + ".")
    key_points = [f"[{SEVERITY_FR[f['severity']]}] {ext(f).get('plain_summary') or f['title']}" for f in c.findings[:5]]
    if len(c.findings) > 5:
        key_points.append(f"… et {len(c.findings) - 5} autre(s) constat(s) détaillé(s) en section 2.")
    rem = _remediation_rows(c)
    immediate = [r[2] for r in rem if r[1] == PRIORITY_FR["immediat"]]

    tech: list[Block] = []
    for n, f in enumerate(c.findings, start=1):
        tech += [
            Subheading(f"{f['finding_id']} — {f['title']}"),
            KeyValue([("Criticité", SEVERITY_FR[f["severity"]]), ("Fiabilité", _corroboration_line(c, f))]
                     + ([("Confiance", CONFIDENCE_FR[ext(f)["confidence"]])] if ext(f).get("confidence") else [])
                     + _origin_row(f) + _ioc_row(f)),
            Label("Faits constatés"), Paragraph(f["description"]),
        ]
        if ext(f).get("interpretation"):
            tech += [Label("Analyse"), Paragraph(ext(f)["interpretation"], "interpretation")]
        tech += [Label("Sources"), _sources_table(c, f["artifact_ids"])] if f["artifact_ids"] else []

    exhibits = [x for f in c.findings for x in (ext(f).get("exhibits") or [])]
    flagged = [t for t in doc["timeline"] if ext(t).get("flags")]

    return [
        Section("1. Résumé exécutif", [
            KeyValue([("Niveau de risque global", risk),
                      ("Constats", ", ".join(f"{SEVERITY_FR[s]} : {sev[s]}" for s in SEVERITY_ORDER if sev[s]) or "0"),
                      ("Périmètre", device_label),
                      ("Période d'examen", f"{fmt.date(start)} → {fmt.date(end)}" if start else "—")]),
            Paragraph(c.case_x.get("executive_summary") or auto_summary),
            Subheading("Ce qu'il faut retenir"),
            Bullets(key_points or ["Aucun constat significatif."]),
            Subheading("Décisions attendues à court terme"),
            Bullets(immediate or ["Aucune action immédiate requise."]),
        ]),
        Section("2. Criticité des constats", [
            Table(["N°", "Constat", "Criticité", "Fiabilité", "Impact"],
                  [[f["finding_id"], f["title"], SEVERITY_FR[f["severity"]], _corr(f["corroborated"]),
                    ext(f).get("business_impact") or "—"] for f in c.findings], [0.6, 2.8, 0.8, 0.9, 2.4]),
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
            KeyValue([("Cadre", f"{BASIS_FR.get(case['authorization']['type'])} — réf. "
                                f"{case['authorization']['reference']}"),
                      ("Périmètre autorisé", _v(ext(case["authorization"]).get("scope")))]),
            _devices_table(doc), _tools_inventory(doc),
            Subheading("Règles de détection appliquées"), *_rules_blocks(doc),
            Subheading("Récupération des enregistrements supprimés"), *_recovery_blocks(c),
        ], new_page=True),
        Section("5. Limites", _limitations(doc)),
        Section("Annexe — Preuves", [
            Subheading("Éléments de preuve"), _evidence_table(doc, fmt),
            Subheading("Chaîne de custody"), _custody_table(doc, fmt),
            Subheading("Pièces (captures, exports)"),
            *(_exhibit_blocks(c, exhibits) or [Paragraph("Aucune pièce jointe.")]),
            Subheading("Inventaire des artefacts"), _inventory_table(doc),
            Subheading("Enregistrements récupérés hors des données actives"), _recovered_table(c),
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
    c = _Ctx(doc, _Fmt(ext(doc["case"]).get("display_timezone")), source_sha256, case_root)
    sections = _judiciaire(c) if template == "judiciaire" else _entreprise(c)
    return ReportModel(template=template, cover=_cover(c, template), sections=sections, footer=CREDIT_LINE,
                       source_sha256=source_sha256, generated_at=utc_now_iso())
