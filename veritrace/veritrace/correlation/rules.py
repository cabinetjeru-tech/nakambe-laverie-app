"""Règles de détection d'anomalies (exécutées à chaque corrélation).

Chaque règle lit UNIQUEMENT le format pivot et produit des constats pivot :
- `description` : faits vérifiables seulement (dates, valeurs, sources) ;
- `x_veritrace.interpretation` : portée et limites, formulées prudemment ;
- `artifact_ids` : artefacts sur lesquels repose le constat (traçabilité jusqu'à la preuve hachée) ;
- `x_veritrace.rule_id` / `rule_version` : règle et version à l'origine du constat.

Idempotence : les constats d'une règle ont un identifiant stable (`F-<règle>-<empreinte>`) et
sont régénérés à chaque passage. Un constat marqué `x_veritrace.reviewed = true` par
l'examinateur n'est plus jamais modifié ni supprimé par les règles.

Configuration par affaire (`case.x_veritrace.rules`) : règles désactivées et seuils.
La liste des règles évaluées, avec leurs paramètres et le nombre de constats, est
consignée dans `x_veritrace.rules_applied` et reprise dans les rapports.

| Règle | Objet | Criticité |
|---|---|---|
| R1 | Application installée hors magasin officiel (APK manuel, navigateur, adb) | moyen ; eleve si ≥ 2 permissions sensibles |
| R2 | Application (magasin) cumulant un service d'accessibilité (déclaré ou activé) / d'écoute des notifications / d'administration et des permissions de surveillance | moyen |
| R3 | Téléchargement d'APK suivi de près par l'installation d'une application hors magasin | eleve |
| R4 | Horodatages postérieurs à l'acquisition ou antérieurs à Android (horloge modifiée, données altérées) | moyen |
| R5 | Interruption anormalement longue de l'activité enregistrée | faible |
"""
from __future__ import annotations

import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from urllib.parse import urlparse

from veritrace.core.hashing import sha256_json
from veritrace.core.timeutil import parse_iso
from veritrace.schema.describe import artifact_summary
from veritrace.schema.pivot import ext, fact_sha, iter_items

RULES_VERSION = "1.0"
SOURCE_TOOL = "Veritrace (règles)"

DEFAULTS = {"gap_hours": 72.0, "future_tolerance_hours": 24.0, "download_window_minutes": 60.0}

#: Magasins d'applications (installation « normale »).
STORE_INSTALLERS = {
    "com.android.vending", "com.amazon.venezia", "com.sec.android.app.samsungapps", "com.huawei.appmarket",
    "com.xiaomi.market", "com.xiaomi.mipicks", "com.heytap.market", "com.oppo.market", "com.vivo.appstore",
    "com.bbk.appstore", "org.fdroid.fdroid", "com.aurora.store", "com.transsion.phoenix", "com.tencent.android.qqdownloader",
}
#: Installateurs révélant une installation manuelle d'APK (installateur de paquets, navigateur, gestionnaire de fichiers).
MANUAL_INSTALLERS = {
    "com.google.android.packageinstaller", "com.android.packageinstaller", "com.samsung.android.packageinstaller",
    "com.android.chrome", "org.mozilla.firefox", "com.sec.android.app.sbrowser", "com.opera.browser",
    "com.brave.browser", "com.microsoft.emmx", "com.google.android.apps.nbu.files", "com.sec.android.app.myfiles",
    "com.mi.android.globalFileexplorer", "com.android.documentsui",
}
SENSITIVE = {
    "READ_SMS", "RECEIVE_SMS", "SEND_SMS", "READ_CALL_LOG", "PROCESS_OUTGOING_CALLS", "ACCESS_FINE_LOCATION",
    "ACCESS_BACKGROUND_LOCATION", "RECORD_AUDIO", "CAMERA", "READ_CONTACTS", "BIND_ACCESSIBILITY_SERVICE",
    "BIND_NOTIFICATION_LISTENER_SERVICE", "BIND_DEVICE_ADMIN", "PACKAGE_USAGE_STATS", "SYSTEM_ALERT_WINDOW",
    "READ_PHONE_STATE",
}
CONTROL = {"BIND_ACCESSIBILITY_SERVICE", "BIND_NOTIFICATION_LISTENER_SERVICE", "BIND_DEVICE_ADMIN"}
SURVEILLANCE = {"READ_SMS", "RECEIVE_SMS", "READ_CALL_LOG", "ACCESS_FINE_LOCATION", "ACCESS_BACKGROUND_LOCATION",
                "RECORD_AUDIO", "CAMERA"}
ACTIVITY = ("sms", "appel", "navigation", "usage_app", "localisation")
ANDROID_EPOCH = datetime(2008, 9, 23, tzinfo=timezone.utc)   # Android 1.0


@dataclass
class Hit:
    key: str
    type: str
    severity: str
    title: str
    description: str
    artifact_ids: list[str]
    interpretation: str
    plain_summary: str
    confidence: str
    remediation: list[dict[str, Any]] = field(default_factory=list)
    business_impact: str | None = None


@dataclass
class Rule:
    rule_id: str
    title: str
    description: str
    run: Callable[["RuleContext"], list[Hit]]


# --------------------------------------------------------------------------- contexte
def _short(perm: str) -> str:
    return perm.rsplit(".", 1)[-1]


def _fmt(dt_or_iso: Any) -> str:
    dt = parse_iso(dt_or_iso) if isinstance(dt_or_iso, str) else dt_or_iso
    return dt.astimezone(timezone.utc).strftime("%d/%m/%Y à %H:%M:%S UTC")


@dataclass
class AppView:
    package: str
    artifacts: list[dict]
    installers: set[str]
    is_system: bool | None
    permissions: set[str]
    first_install: datetime | None
    accessibility: bool = False          # service d'accessibilité ACTIVÉ (dumpsys accessibility)

    @property
    def install_class(self) -> str:
        """magasin | manuel | inconnu | autre."""
        if self.installers & STORE_INSTALLERS:
            return "magasin"
        if self.installers & MANUAL_INSTALLERS:
            return "manuel"
        if not self.installers:
            return "inconnu"
        return "autre"


class RuleContext:
    def __init__(self, doc: dict[str, Any], config: dict[str, Any]) -> None:
        self.doc = doc
        self.cfg = {**DEFAULTS, **{k: v for k, v in config.items() if k in DEFAULTS}}
        self.by_id = {a["artifact_id"]: a for a in doc["artifacts"]}
        self.apps = self._apps()
        self.usage: dict[str, list[dict]] = defaultdict(list)
        for a in doc["artifacts"]:
            if a["category"] == "usage_app" and a.get("timestamp"):
                self.usage[(a["data"].get("package") or "").lower()].append(a)
        self.ioc_packages = {(a["data"].get("ioc_value") or "").lower() for a in doc["artifacts"]
                             if a["category"] == "ioc" and a["data"].get("ioc_type") == "application"}

    def _apps(self) -> dict[str, AppView]:
        groups: dict[str, list[dict]] = defaultdict(list)
        for a in self.doc["artifacts"]:
            if a["category"] == "application" and a["data"].get("package"):
                groups[a["data"]["package"].lower()].append(a)
        apps = {}
        for pkg, arts in groups.items():
            system_flags = {a["data"].get("is_system") for a in arts} - {None}
            installs = [parse_iso(a["data"]["first_install"]) for a in arts if a["data"].get("first_install")]
            apps[pkg] = AppView(
                package=arts[0]["data"]["package"], artifacts=arts,
                installers={a["data"]["installer"] for a in arts if a["data"].get("installer")},
                # Une source qui la dit système suffit ; « non système » exige une source explicite.
                is_system=True if True in system_flags else (False if False in system_flags else None),
                permissions={_short(p) for a in arts for p in a["data"].get("permissions") or []},
                first_install=min(installs) if installs else None,
                accessibility=any(a["data"].get("accessibility_service_enabled") for a in arts))
        return apps

    def reference_time(self) -> datetime | None:
        """Instant de référence : début de la première acquisition de l'appareil (ou première collecte)."""
        adb = [parse_iso(a["started_at"]) for a in self.doc["acquisitions"] if a["method"] != "import"]
        if adb:
            return min(adb)
        collected = [parse_iso(it["collected_at"]) for _, it in iter_items(self.doc)]
        return min(collected) if collected else None


# --------------------------------------------------------------------------- R1
def rule_sideload(ctx: RuleContext) -> list[Hit]:
    hits = []
    for pkg, app in sorted(ctx.apps.items()):
        if app.is_system is not False or app.install_class not in ("inconnu", "manuel"):
            continue
        sensitive = sorted(app.permissions & SENSITIVE)
        if app.accessibility:
            sensitive.append("service d'accessibilité ACTIVÉ")
        usage = sorted(ctx.usage.get(pkg, []), key=lambda a: parse_iso(a["timestamp"]))
        how = ("aucun installateur n'est déclaré (installation par adb ou par un moyen ne laissant pas de trace "
               "d'installateur)" if app.install_class == "inconnu"
               else f"l'installateur déclaré est {', '.join(sorted(app.installers))} (installation manuelle d'un APK)")
        facts = [f"L'application {app.package} est installée sur l'appareil"
                 + (f" (première installation le {_fmt(app.first_install)})" if app.first_install else "") + ".",
                 f"Il ne s'agit pas d'une application système et {how}."]
        if sensitive:
            facts.append(f"Permissions sensibles accordées : {', '.join(sensitive)}.")
        if usage:
            facts.append(f"{len(usage)} événement(s) d'utilisation enregistré(s), le dernier le "
                         f"{_fmt(usage[-1]['timestamp'])}.")
        if pkg in ctx.ioc_packages:
            facts.append("Ce paquet fait par ailleurs l'objet d'une détection IOC.")
        severity = "eleve" if len(sensitive) >= 2 else "moyen"
        hits.append(Hit(
            key=pkg, type="application_suspecte", severity=severity,
            title=f"Application installée hors magasin officiel : {app.package}",
            description=" ".join(facts),
            artifact_ids=[a["artifact_id"] for a in app.artifacts + usage[-5:]],
            interpretation=("Une installation hors magasin n'est pas illicite en soi (application d'entreprise, outil "
                            "de développement). Elle contourne toutefois les contrôles du magasin officiel et constitue "
                            "le mode d'installation habituel des logiciels de surveillance"
                            + (" ; les permissions accordées permettent l'accès aux communications ou à la localisation."
                               if severity == "eleve" else ".")),
            plain_summary=(f"Une application ({app.package}) a été installée manuellement, en dehors du magasin "
                           "d'applications" + (", avec des accès étendus aux données." if severity == "eleve" else ".")),
            confidence="elevee" if app.install_class == "manuel" or sensitive else "moyenne",
            business_impact="Risque d'accès non autorisé aux données de l'appareil." if severity == "eleve" else None,
            remediation=[{"action": f"Vérifier auprès de l'utilisateur l'origine et la légitimité de {app.package}.",
                          "priority": "immediat" if severity == "eleve" else "court_terme",
                          "owner": "Responsable sécurité"},
                         {"action": "Bloquer l'installation de sources inconnues (politique MDM).",
                          "priority": "court_terme", "owner": "Administrateur MDM"}]))
    return hits


# --------------------------------------------------------------------------- R2
def rule_surveillance_capabilities(ctx: RuleContext) -> list[Hit]:
    hits = []
    for pkg, app in sorted(ctx.apps.items()):
        if app.is_system or app.install_class in ("inconnu", "manuel"):
            continue  # applications système exclues ; les sideloads relèvent de R1
        control = sorted(app.permissions & CONTROL) + (["service d'accessibilité activé"] if app.accessibility else [])
        surveil = sorted(app.permissions & SURVEILLANCE)
        if not control or len(surveil) < 2:
            continue
        hits.append(Hit(
            key=pkg, type="application_suspecte", severity="moyen",
            title=f"Capacités de surveillance cumulées : {app.package}",
            description=(f"L'application {app.package} (installateur : {', '.join(sorted(app.installers)) or 'inconnu'}) "
                         f"dispose de {', '.join(control)} et des permissions {', '.join(surveil)}."),
            artifact_ids=[a["artifact_id"] for a in app.artifacts],
            interpretation=("Ce cumul permet de lire l'écran ou les notifications et d'accéder aux communications ou à "
                            "la localisation. Il existe chez des applications légitimes (accessibilité, gestion de "
                            "flotte) ; il doit être confronté à l'usage déclaré de l'application."),
            plain_summary=f"L'application {app.package} dispose de droits permettant de surveiller l'utilisateur.",
            confidence="moyenne",
            remediation=[{"action": f"Confirmer que {app.package} est attendue et que ses droits sont justifiés.",
                          "priority": "court_terme", "owner": "Responsable sécurité"}]))
    return hits


# --------------------------------------------------------------------------- R3
def _looks_like_apk_download(url: str) -> bool:
    try:
        u = urlparse(url)
    except ValueError:
        return False
    path = (u.path or "").lower()
    return path.endswith(".apk") or "/apk" in path or "apk" in (u.query or "").lower()


def rule_download_then_install(ctx: RuleContext) -> list[Hit]:
    window = timedelta(minutes=float(ctx.cfg["download_window_minutes"]))
    navs = [a for a in ctx.doc["artifacts"] if a["category"] == "navigation" and a.get("timestamp")
            and _looks_like_apk_download(a["data"].get("url") or "")]
    hits = []
    for pkg, app in sorted(ctx.apps.items()):
        if app.is_system is not False or app.install_class not in ("inconnu", "manuel") or not app.first_install:
            continue
        before = [n for n in navs if timedelta(0) <= app.first_install - parse_iso(n["timestamp"]) <= window]
        if not before:
            continue
        n = max(before, key=lambda a: parse_iso(a["timestamp"]))
        delta = app.first_install - parse_iso(n["timestamp"])
        minutes, seconds = divmod(int(delta.total_seconds()), 60)
        hits.append(Hit(
            key=f"{pkg}|{fact_sha(n)}", type="anomalie", severity="eleve",
            title=f"Téléchargement d'APK suivi de l'installation de {app.package}",
            description=(f"Le {_fmt(n['timestamp'])}, l'adresse {n['data'].get('url')} a été visitée"
                         + (f" avec {n['data']['browser']}" if n["data"].get("browser") else "") + ". "
                         f"Le {_fmt(app.first_install)}, soit {minutes} min {seconds:02d} s plus tard, l'application "
                         f"{app.package} a été installée hors magasin officiel."),
            artifact_ids=[n["artifact_id"]] + [a["artifact_id"] for a in app.artifacts],
            interpretation=("L'enchaînement est compatible avec le téléchargement puis l'installation manuelle de "
                            "l'APK de cette application. La corrélation est temporelle : le fichier téléchargé n'a pas "
                            "été rapproché de l'application installée (empreinte), et l'auteur de l'installation n'est "
                            "pas identifié."),
            plain_summary=f"L'application {app.package} a été installée quelques minutes après le téléchargement d'un fichier d'installation sur internet.",
            confidence="moyenne",
            business_impact="Indique une intervention manuelle sur l'appareil déverrouillé.",
            remediation=[{"action": "Rechercher le fichier APK téléchargé (dossier Téléchargements) et comparer son "
                                    "empreinte avec l'application installée.", "priority": "court_terme",
                          "owner": "Examinateur"}]))
    return hits


# --------------------------------------------------------------------------- R4
def rule_timestamps(ctx: RuleContext) -> list[Hit]:
    ref = ctx.reference_time()
    tolerance = timedelta(hours=float(ctx.cfg["future_tolerance_hours"]))
    future, ancient = [], []
    for a in ctx.doc["artifacts"]:
        if not a.get("timestamp"):
            continue
        ts = parse_iso(a["timestamp"])
        if ref and ts > ref + tolerance:
            future.append(a)
        elif ts < ANDROID_EPOCH:
            ancient.append(a)
    hits = []
    for kind, arts in (("futur", future), ("ancien", ancient)):
        if not arts:
            continue
        arts = sorted(arts, key=lambda a: parse_iso(a["timestamp"]))
        examples = "; ".join(f"{artifact_summary(a)} — {_fmt(a['timestamp'])}" for a in arts[:3])
        if kind == "futur":
            title = "Horodatages postérieurs à l'acquisition"
            desc = (f"{len(arts)} enregistrement(s) portent une date postérieure de plus de "
                    f"{ctx.cfg['future_tolerance_hours']:g} h au début de l'acquisition ({_fmt(ref)}). Exemples : {examples}.")
        else:
            title = "Horodatages antérieurs à l'existence d'Android"
            desc = f"{len(arts)} enregistrement(s) portent une date antérieure au 23/09/2008. Exemples : {examples}."
        hits.append(Hit(
            key=kind, type="anomalie", severity="moyen", title=title, description=desc,
            artifact_ids=[a["artifact_id"] for a in arts[:50]],
            interpretation=("Ces dates sont impossibles au regard de la chronologie de l'examen. Elles peuvent résulter "
                            "d'un changement de l'horloge de l'appareil, d'une saisie manuelle, d'une altération des "
                            "données ou d'une erreur de décodage par l'outil. La fiabilité de la chronologie doit être "
                            "appréciée en conséquence."),
            plain_summary="Certaines dates enregistrées sur l'appareil sont incohérentes : l'horloge a pu être modifiée.",
            confidence="moyenne",
            remediation=[{"action": "Vérifier les journaux de changement d'heure de l'appareil et recouper avec une "
                                    "source externe (opérateur, serveurs).", "priority": "court_terme",
                          "owner": "Examinateur"}]))
    return hits


# --------------------------------------------------------------------------- R5
def rule_activity_gaps(ctx: RuleContext) -> list[Hit]:
    ref = ctx.reference_time()
    tol = timedelta(hours=float(ctx.cfg["future_tolerance_hours"]))
    # Un fait = un instant (dédoublonnage inter-outils), activités utilisateur uniquement.
    events: dict[str, dict] = {}
    for a in ctx.doc["artifacts"]:
        if a["category"] in ACTIVITY and a.get("timestamp"):
            ts = parse_iso(a["timestamp"])
            if ts < ANDROID_EPOCH or (ref and ts > ref + tol):
                continue  # dates impossibles : traitées par R4
            events.setdefault(fact_sha(a), a)
    seq = sorted(events.values(), key=lambda a: parse_iso(a["timestamp"]))
    if len(seq) < 5:
        return []
    deltas = [(parse_iso(b["timestamp"]) - parse_iso(a["timestamp"]), a, b) for a, b in zip(seq, seq[1:])]
    median = statistics.median(d.total_seconds() for d, _, _ in deltas)
    threshold = max(float(ctx.cfg["gap_hours"]) * 3600, 10 * median)
    gaps = sorted([g for g in deltas if g[0].total_seconds() > threshold], key=lambda g: -g[0].total_seconds())[:3]
    hits = []
    for d, a, b in gaps:
        days = d.total_seconds() / 86400
        hits.append(Hit(
            key=f"{fact_sha(a)}|{fact_sha(b)}", type="anomalie", severity="faible",
            title=f"Interruption de l'activité enregistrée ({days:.1f} jours)",
            description=(f"Aucune activité (SMS, appels, navigation, usage des applications, localisation) n'est "
                         f"enregistrée entre le {_fmt(a['timestamp'])} ({artifact_summary(a)}) et le "
                         f"{_fmt(b['timestamp'])} ({artifact_summary(b)}), soit {days:.1f} jours ; l'intervalle "
                         f"médian entre deux activités est de {median / 3600:.1f} h."),
            artifact_ids=[a["artifact_id"], b["artifact_id"]],
            interpretation=("Une telle interruption peut s'expliquer par l'appareil éteint ou inutilisé, par la "
                            "rotation des journaux, ou par la suppression de données sur la période. Elle délimite une "
                            "période sur laquelle les constatations sont incomplètes."),
            plain_summary=f"Aucune activité n'est enregistrée pendant {days:.0f} jours : données possiblement manquantes.",
            confidence="faible",
            remediation=[{"action": "Interroger l'utilisateur sur l'usage de l'appareil pendant la période et rechercher "
                                    "d'éventuelles suppressions.", "priority": "moyen_terme", "owner": "Examinateur"}]))
    return hits


RULES: list[Rule] = [
    Rule("R1", "Application installée hors magasin officiel",
         "Application non système sans installateur ou installée par un installateur de paquets / navigateur.",
         rule_sideload),
    Rule("R2", "Capacités de surveillance cumulées",
         "Application de magasin combinant accessibilité/notifications/administration et ≥ 2 permissions de surveillance.",
         rule_surveillance_capabilities),
    Rule("R3", "Téléchargement d'APK suivi d'une installation",
         "Visite d'une URL d'APK dans la fenêtre précédant l'installation d'une application hors magasin.",
         rule_download_then_install),
    Rule("R4", "Horodatages incohérents",
         "Dates postérieures à l'acquisition (au-delà de la tolérance) ou antérieures à Android.",
         rule_timestamps),
    Rule("R5", "Interruption de l'activité",
         "Écart entre deux activités supérieur au seuil et à 10 fois l'écart médian.",
         rule_activity_gaps),
]


# --------------------------------------------------------------------------- moteur
def finding_id(rule_id: str, key: str) -> str:
    return f"F-{rule_id}-{sha256_json([rule_id, key])[:10]}"


def run_rules(doc: dict[str, Any]) -> int:
    """Évalue les règles et met à jour les constats générés ; renvoie le nombre de constats produits."""
    config = ext(doc["case"]).get("rules") or {}
    disabled = set(config.get("disabled") or [])
    ctx = RuleContext(doc, config)
    reviewed = {f["finding_id"] for f in doc["findings"] if ext(f).get("rule_id") and ext(f).get("reviewed")}
    # Retire les constats générés non revus : ils sont recalculés ci-dessous.
    doc["findings"] = [f for f in doc["findings"] if not ext(f).get("rule_id") or ext(f).get("reviewed")]
    applied, produced = [], 0
    for rule in RULES:
        hits = [] if rule.rule_id in disabled else rule.run(ctx)
        applied.append({"rule_id": rule.rule_id, "version": RULES_VERSION, "title": rule.title,
                        "description": rule.description, "enabled": rule.rule_id not in disabled,
                        "hits": len(hits), "parameters": dict(ctx.cfg)})
        for h in hits:
            fid = finding_id(rule.rule_id, h.key)
            if fid in reviewed:
                continue
            x = {"rule_id": rule.rule_id, "rule_version": RULES_VERSION, "interpretation": h.interpretation,
                 "plain_summary": h.plain_summary, "confidence": h.confidence, "remediation": h.remediation}
            if h.business_impact:
                x["business_impact"] = h.business_impact
            doc["findings"].append({
                "finding_id": fid, "type": h.type, "severity": h.severity, "title": h.title,
                "description": h.description, "artifact_ids": list(dict.fromkeys(h.artifact_ids)), "item_ids": [],
                "corroborated": False, "source_tool": f"{SOURCE_TOOL} {rule.rule_id}", "x_veritrace": x})
            produced += 1
    doc.setdefault("x_veritrace", {})["rules_applied"] = applied
    return produced
