"""Construit le document d'exemple (affaire fictive) conforme au schéma.

Le fichier `examples/example_case.json` est généré par ce module
(`python -m veritrace.schema.example > veritrace/schema/examples/example_case.json`) ;
un test vérifie que les deux restent identiques. Toutes les personnes, numéros,
appareils et indicateurs sont FICTIFS.

Scénario : suspicion de stalkerware sur le téléphone d'une plaignante qui consent par
écrit à l'examen. Il illustre la corroboration (ALEAPP + MVT + parseur SQLite Veritrace
confirment les mêmes faits, même `content_sha256`).
"""
from __future__ import annotations

import json
import sys
from typing import Any

from veritrace import __author__, __version__
from veritrace.core.hashing import sha256_bytes
from veritrace.schema.validator import content_hash

TOOL_ALEAPP = {"name": "ALEAPP", "version": "3.4.0"}
TOOL_MVT = {"name": "MVT", "version": "2.6.1"}
TOOL_VT = {"name": "veritrace-sqlite", "version": __version__}
TOOL_ADB = {"name": "adb", "version": "35.0.2"}

EXAMINER = "Examinateur Exemple"


def _fake_hash(label: str) -> str:
    return sha256_bytes(f"veritrace-example:{label}".encode())


def _artifact(aid: str, category: str, ts: str | None, tool: dict, run_id: str, evidence_id: str,
              data: dict, file_path: str | None = None, record_ref: str | None = None,
              tags: list[str] | None = None) -> dict[str, Any]:
    return {
        "artifact_id": aid,
        "category": category,
        "timestamp": ts,
        "source": {"tool": tool, "run_id": run_id, "evidence_id": evidence_id,
                   "file_path": file_path, "record_ref": record_ref},
        "data": data,
        "content_sha256": content_hash(category, data),
        "corroboration": {"status": "single_source", "sources": [{"tool": tool["name"], "artifact_id": aid}]},
        "tags": tags or [],
    }


def _corroborate(arts: list[dict]) -> None:
    """Marque comme corroborés les artefacts de même content_sha256 issus d'outils distincts."""
    groups: dict[str, list[dict]] = {}
    for a in arts:
        groups.setdefault(a["content_sha256"], []).append(a)
    for group in groups.values():
        sources = [{"tool": a["source"]["tool"]["name"], "artifact_id": a["artifact_id"]} for a in group]
        if len({s["tool"] for s in sources}) >= 2:
            for a in group:
                a["corroboration"] = {"status": "corroborated", "sources": sources}


def build_example() -> dict[str, Any]:
    spy_pkg = "com.sys.monitor.service"
    spy_app = {"package": spy_pkg, "app_name": "System Service", "version_name": "4.2.1",
               "installer": None, "first_install": "2026-08-14T21:03:11+00:00", "is_system": False,
               "permissions": ["android.permission.READ_SMS", "android.permission.ACCESS_FINE_LOCATION",
                               "android.permission.RECORD_AUDIO", "android.permission.BIND_ACCESSIBILITY_SERVICE"]}
    sms = {"direction": "incoming", "address": "+22670000001", "contact_name": "Contact A",
           "body": "Je sais où tu étais hier soir.", "service": "sms", "read": True, "thread_id": 12}

    E1, E2, E3 = "EV-001", "EV-002", "EV-003"
    artifacts = [
        _artifact("ART-0001", "sms", "2026-09-02T19:44:05+00:00", TOOL_ALEAPP, "RUN-ALEAPP-01", E1, sms,
                  "/data/data/com.android.providers.telephony/databases/mmssms.db", "sms:rowid=4471"),
        _artifact("ART-0002", "sms", "2026-09-02T19:44:05+00:00", TOOL_VT, "RUN-VT-01", E1, sms,
                  "/data/data/com.android.providers.telephony/databases/mmssms.db", "sms:rowid=4471"),
        _artifact("ART-0003", "call", "2026-09-02T20:01:47+00:00", TOOL_ALEAPP, "RUN-ALEAPP-01", E1,
                  {"direction": "missed", "number": "+22670000001", "contact_name": "Contact A",
                   "duration_s": 0, "call_type": "voice"},
                  "/data/data/com.android.providers.contacts/databases/calllog.db", "calls:rowid=902"),
        _artifact("ART-0004", "installed_app", "2026-08-14T21:03:11+00:00", TOOL_ALEAPP, "RUN-ALEAPP-01", E1,
                  spy_app, "/data/system/packages.xml", None, ["sideload"]),
        _artifact("ART-0005", "installed_app", "2026-08-14T21:03:11+00:00", TOOL_MVT, "RUN-MVT-01", E2,
                  spy_app, "dumpsys package", None, ["sideload"]),
        _artifact("ART-0006", "ioc_match", "2026-08-14T21:03:11+00:00", TOOL_MVT, "RUN-MVT-01", E2,
                  {"indicator_type": "package", "indicator": spy_pkg, "matched_value": spy_pkg,
                   "ioc_source": "stalkerware-indicators (jeu d'IOC fictif pour l'exemple)",
                   "malware_family": "FictiveSpy"}, None, None, ["ioc"]),
        _artifact("ART-0007", "app_usage", "2026-09-02T19:40:00+00:00", TOOL_ALEAPP, "RUN-ALEAPP-01", E1,
                  {"package": spy_pkg, "event": "foreground", "duration_s": 3.0},
                  "/data/system/usagestats/0/daily/", None),
        _artifact("ART-0008", "location", "2026-09-01T22:15:30+00:00", TOOL_ALEAPP, "RUN-ALEAPP-01", E1,
                  {"latitude": 11.7802, "longitude": -0.3703, "accuracy_m": 12.0, "altitude_m": None,
                   "provider": "fused", "source_app": "com.google.android.gms"},
                  "/data/data/com.google.android.gms/databases/", None),
        _artifact("ART-0009", "browser_history", "2026-08-14T20:58:42+00:00", TOOL_ALEAPP, "RUN-ALEAPP-01", E1,
                  {"url": "https://download.example-monitor.invalid/apk/latest", "title": "Download",
                   "browser": "Chrome", "visit_count": 1},
                  "/data/data/com.android.chrome/app_chrome/Default/History", "urls:id=311"),
        _artifact("ART-0010", "wifi", "2026-09-02T18:00:00+00:00", TOOL_ALEAPP, "RUN-ALEAPP-01", E1,
                  {"ssid": "MAISON-WIFI", "bssid": "a4:2b:b0:00:00:01", "security": "WPA2-PSK",
                   "last_connected": "2026-09-02T18:00:00+00:00"},
                  "/data/misc/apexdata/com.android.wifi/WifiConfigStore.xml", None),
        _artifact("ART-0011", "contact", None, TOOL_VT, "RUN-VT-01", E1,
                  {"display_name": "Contact A", "phone_numbers": ["+22670000001"], "emails": [], "account": None},
                  "/data/data/com.android.providers.contacts/databases/contacts2.db", "raw_contacts:_id=55"),
        _artifact("ART-0012", "account", None, TOOL_ALEAPP, "RUN-ALEAPP-01", E1,
                  {"account_type": "com.google", "account_name": "titulaire.exemple@example.invalid",
                   "package": "com.google.android.gms"},
                  "/data/system_ce/0/accounts_ce.db", None),
        _artifact("ART-0013", "bluetooth", "2026-08-30T08:12:00+00:00", TOOL_ALEAPP, "RUN-ALEAPP-01", E1,
                  {"mac": "00:1A:7D:00:00:02", "name": "Écouteurs BT", "paired": True,
                   "last_seen": "2026-08-30T08:12:00+00:00"},
                  "/data/misc/bluedroid/bt_config.conf", None),
    ]
    _corroborate(artifacts)

    timeline = [
        {"event_id": "TL-0001", "timestamp": "2026-08-14T20:58:42+00:00", "category": "browser_history",
         "summary": "Visite d'une page de téléchargement d'APK (download.example-monitor.invalid)",
         "artifact_ids": ["ART-0009"], "corroborated": False, "sources": ["ALEAPP"], "flags": ["notable"]},
        {"event_id": "TL-0002", "timestamp": "2026-08-14T21:03:11+00:00", "category": "installed_app",
         "summary": f"Installation hors Play Store de {spy_pkg} (« System Service »)",
         "artifact_ids": ["ART-0004", "ART-0005"], "corroborated": True, "sources": ["ALEAPP", "MVT"],
         "flags": ["suspicious_app"]},
        {"event_id": "TL-0003", "timestamp": "2026-08-14T21:03:11+00:00", "category": "ioc_match",
         "summary": f"Correspondance IOC : {spy_pkg} (famille FictiveSpy)",
         "artifact_ids": ["ART-0006"], "corroborated": False, "sources": ["MVT"], "flags": ["ioc"]},
        {"event_id": "TL-0004", "timestamp": "2026-08-30T08:12:00+00:00", "category": "bluetooth",
         "summary": "Dernière connexion de l'appareil Bluetooth « Écouteurs BT »",
         "artifact_ids": ["ART-0013"], "corroborated": False, "sources": ["ALEAPP"], "flags": []},
        {"event_id": "TL-0005", "timestamp": "2026-09-01T22:15:30+00:00", "category": "location",
         "summary": "Position enregistrée 11.7802, -0.3703 (±12 m)",
         "artifact_ids": ["ART-0008"], "corroborated": False, "sources": ["ALEAPP"], "flags": []},
        {"event_id": "TL-0006", "timestamp": "2026-09-02T18:00:00+00:00", "category": "wifi",
         "summary": "Connexion au réseau Wi-Fi « MAISON-WIFI »",
         "artifact_ids": ["ART-0010"], "corroborated": False, "sources": ["ALEAPP"], "flags": []},
        {"event_id": "TL-0007", "timestamp": "2026-09-02T19:40:00+00:00", "category": "app_usage",
         "summary": f"{spy_pkg} au premier plan (3 s)",
         "artifact_ids": ["ART-0007"], "corroborated": False, "sources": ["ALEAPP"], "flags": ["suspicious_app"]},
        {"event_id": "TL-0008", "timestamp": "2026-09-02T19:44:05+00:00", "category": "sms",
         "summary": "SMS reçu de +22670000001 (Contact A) : « Je sais où tu étais hier soir. »",
         "artifact_ids": ["ART-0001", "ART-0002"], "corroborated": True, "sources": ["ALEAPP", "veritrace-sqlite"],
         "flags": ["notable"]},
        {"event_id": "TL-0009", "timestamp": "2026-09-02T20:01:47+00:00", "category": "call",
         "summary": "Appel manqué de +22670000001 (Contact A)",
         "artifact_ids": ["ART-0003"], "corroborated": False, "sources": ["ALEAPP"], "flags": []},
    ]

    findings = [
        {"finding_id": "F-001", "type": "ioc_match", "severity": "critical",
         "title": f"Présence du paquet {spy_pkg}, référencé dans un jeu d'indicateurs de stalkerware",
         "description": (f"Le paquet {spy_pkg} (« System Service », version 4.2.1) est installé sur l'appareil. "
                         "Il figure dans packages.xml (extraction ALEAPP) et dans la sortie dumpsys package "
                         "(analyse MVT). MVT signale une correspondance avec l'indicateur de type « package » "
                         "du jeu stalkerware-indicators, famille FictiveSpy."),
         "interpretation": ("La présence du paquet est établie par deux outils indépendants. Sa correspondance "
                            "avec un indicateur connu rend très probable qu'il s'agisse d'un logiciel de "
                            "surveillance ; son fonctionnement effectif n'a pas été analysé (pas de rétro-ingénierie)."),
         "plain_summary": ("Un logiciel espion connu est installé sur le téléphone. Il peut permettre à un tiers "
                           "de lire les messages et de suivre la position de l'utilisatrice."),
         "business_impact": "Exposition des communications et de la localisation de la personne concernée.",
         "artifact_ids": ["ART-0004", "ART-0005", "ART-0006"], "evidence_ids": [E1, E2],
         "corroborated": True, "confidence": "high",
         "recommendation": "Conserver l'appareil en l'état ; ne pas désinstaller avant la fin des constatations.",
         "remediation": [
             {"action": "Isoler l'appareil (mode avion) et le conserver sous scellé jusqu'à la clôture des constatations.",
              "priority": "immediate", "owner": "Responsable sécurité"},
             {"action": "Après constatations : réinitialisation d'usine et changement de tous les mots de passe "
                        "des comptes synchronisés depuis un autre appareil sain.",
              "priority": "short_term", "owner": "Support informatique"}],
         "exhibits": [
             {"exhibit_id": "PC-001", "type": "screenshot",
              "path": "parsed/exhibits/PC-001_parametres_applications.png", "sha256": _fake_hash("PC-001"),
              "description": "Capture de l'écran Paramètres › Applications montrant « System Service ».",
              "artifact_id": "ART-0004", "captured_at": "2026-09-10T09:00:30+00:00"},
             {"exhibit_id": "PC-002", "type": "export", "path": "parsed/mvt/detected.json",
              "sha256": _fake_hash("PC-002"), "description": "Export MVT des détections IOC.",
              "artifact_id": "ART-0006", "captured_at": "2026-09-10T10:38:00+00:00"}]},
        {"finding_id": "F-002", "type": "suspicious_app", "severity": "high",
         "title": "Installation hors magasin officiel avec permissions étendues",
         "description": ("Le 14/08/2026 à 20:58:42 UTC, le navigateur Chrome a visité "
                         "https://download.example-monitor.invalid/apk/latest. Le 14/08/2026 à 21:03:11 UTC, le "
                         f"paquet {spy_pkg} a été installé sans installateur déclaré. Il détient les permissions "
                         "READ_SMS, ACCESS_FINE_LOCATION, RECORD_AUDIO et BIND_ACCESSIBILITY_SERVICE."),
         "interpretation": ("L'enchaînement (téléchargement puis installation 4 min 29 s plus tard, sans magasin "
                            "d'applications) est compatible avec une installation manuelle d'un APK. Ces "
                            "éléments ne permettent pas d'identifier la personne ayant réalisé l'installation."),
         "plain_summary": ("Le logiciel a été installé manuellement depuis un site web, en contournant le magasin "
                           "d'applications, et dispose d'accès étendus (SMS, position, micro)."),
         "business_impact": "Indique un accès physique à l'appareil déverrouillé le 14/08/2026 au soir.",
         "artifact_ids": ["ART-0004", "ART-0009"], "evidence_ids": [E1],
         "corroborated": True, "confidence": "medium",
         "remediation": [
             {"action": "Interdire l'installation d'applications de sources inconnues (politique MDM).",
              "priority": "short_term", "owner": "Administrateur MDM"},
             {"action": "Sensibiliser la personne concernée au verrouillage de l'appareil et au partage du code.",
              "priority": "medium_term", "owner": "RH / Sécurité"}]},
        {"finding_id": "F-003", "type": "observation", "severity": "medium",
         "title": "Message évoquant la localisation de la titulaire",
         "description": ("Le 02/09/2026 à 19:44:05 UTC, un SMS provenant de +22670000001 (« Contact A ») a été "
                         "reçu : « Je sais où tu étais hier soir. ». Une position (11.7802, -0.3703, ±12 m) est "
                         "enregistrée sur l'appareil le 01/09/2026 à 22:15:30 UTC."),
         "interpretation": ("La proximité temporelle entre la position enregistrée et le message est compatible "
                            "avec une exploitation des données de localisation, sans l'établir : l'expéditeur "
                            "a pu obtenir l'information par un autre moyen."),
         "plain_summary": "Un message reçu laisse penser que l'expéditeur connaît les déplacements de l'utilisatrice.",
         "artifact_ids": ["ART-0001", "ART-0002", "ART-0008"], "evidence_ids": [E1],
         "corroborated": True, "confidence": "low",
         "remediation": [
             {"action": "Transmettre les éléments à l'autorité compétente / au conseil juridique.",
              "priority": "immediate", "owner": "Direction juridique"}]},
    ]

    h1, h2, h3 = _fake_hash("backup.ab"), _fake_hash("dumpsys_package.txt"), _fake_hash("consentement.pdf")
    return {
        "schema_version": "0.2.0",
        "case": {
            "case_id": "VT-2026-0042",
            "title": "Suspicion de logiciel espion — téléphone de la plaignante",
            "created_at": "2026-09-10T08:30:00+00:00",
            "report_type": "judiciaire",
            "display_timezone": "Africa/Ouagadougou",
            "executive_summary": (
                "Un logiciel de surveillance connu est installé sur le téléphone examiné. Il a été installé "
                "manuellement le 14 août 2026, hors magasin d'applications, et dispose d'accès aux SMS, à la "
                "position et au micro. Un message reçu le 2 septembre suggère que son expéditeur connaît les "
                "déplacements de l'utilisatrice. L'appareil doit être isolé et conservé en l'état ; les comptes "
                "associés doivent être sécurisés depuis un appareil sain."),
            "mission": ("Rechercher la présence d'un logiciel espion ou de harcèlement (stalkerware) sur le "
                        "téléphone remis, et établir la chronologie de son installation et de son activité."),
            "requesting_party": {"name": "Parquet du Tribunal (fictif)", "role": "Autorité requérante",
                                 "reference": "RP-2026-1187"},
            "organization": {"name": "Cabinet d'expertise (à personnaliser)",
                             "address": "Adresse du cabinet, Ville, Pays", "phone": "+226 00 00 00 00",
                             "email": "contact@cabinet.example", "website": "https://cabinet.example",
                             "registration": "Expert agréé n° 0000", "logo_path": None},
            "examiners": [{"name": EXAMINER, "role": "Expert en investigation numérique",
                           "qualification": "Certification forensique mobile (exemple)"}],
            "legal_authorization": {
                "basis": "consentement", "reference": "PV-CONS-2026-0042",
                "issued_by": "Titulaire de l'appareil", "issued_at": "2026-09-10T08:00:00+00:00",
                "scope": "Acquisition logique complète ; données du 01/08/2026 au 10/09/2026.",
                "document_sha256": h3, "verified_by": EXAMINER, "verified_at": "2026-09-10T08:25:00+00:00"},
            "limitations": [
                "Acquisition logique uniquement : les données des applications excluant la sauvegarde ADB "
                "(allowBackup=false) ne sont pas couvertes.",
                "Aucune donnée supprimée n'a été récupérée (pas d'acquisition physique).",
            ],
        },
        "devices": [{
            "device_id": "DEV-01", "manufacturer": "Samsung", "model": "Galaxy A54 (SM-A546B)",
            "android_version": "14", "security_patch": "2026-07-01",
            "build_fingerprint": "samsung/a54xnseea/a54x:14/UP1A.231005.007/A546BXXS8BXF1:user/release-keys",
            "serial": "R5CW0000000", "imei": ["350000000000001"], "owner": "Plaignante (identité au dossier)",
            "state_on_receipt": "Allumé, déverrouillé par la titulaire, débogage USB activé par elle",
            "seal_number": "SC-2026-0042-A"}],
        "acquisitions": [
            {"acquisition_id": "ACQ-01", "device_id": "DEV-01", "method": "adb_backup",
             "started_at": "2026-09-10T09:02:00+00:00", "ended_at": "2026-09-10T09:41:00+00:00",
             "operator": EXAMINER, "tool": TOOL_ADB, "status": "success"},
            {"acquisition_id": "ACQ-02", "device_id": "DEV-01", "method": "adb_dumpsys",
             "started_at": "2026-09-10T09:45:00+00:00", "ended_at": "2026-09-10T09:46:30+00:00",
             "operator": EXAMINER, "tool": TOOL_ADB, "status": "success"},
        ],
        "evidence_items": [
            {"evidence_id": E1, "acquisition_id": "ACQ-01", "label": "Sauvegarde ADB complète",
             "type": "backup", "local_path": "acquisition/raw/ACQ-01/backup.ab", "device_path": None,
             "sha256": h1, "size_bytes": 3_221_225_472, "collected_at": "2026-09-10T09:41:00+00:00",
             "collected_by": EXAMINER},
            {"evidence_id": E2, "acquisition_id": "ACQ-02", "label": "Sortie dumpsys package",
             "type": "file", "local_path": "acquisition/raw/ACQ-02/dumpsys_package.txt",
             "device_path": None, "sha256": h2, "size_bytes": 2_457_600,
             "collected_at": "2026-09-10T09:46:30+00:00", "collected_by": EXAMINER},
            {"evidence_id": E3, "acquisition_id": None, "label": "PV de consentement signé (scan)",
             "type": "document", "local_path": "custody/documents/consentement.pdf", "device_path": None,
             "sha256": h3, "size_bytes": 184_320, "collected_at": "2026-09-10T08:20:00+00:00",
             "collected_by": EXAMINER},
        ],
        "custody_chain": [
            {"event_id": "COC-001", "timestamp": "2026-09-10T08:20:00+00:00", "evidence_id": E3,
             "action": "collected", "actor": EXAMINER, "sha256": h3, "location": "Cabinet — bureau 2"},
            {"event_id": "COC-002", "timestamp": "2026-09-10T09:41:05+00:00", "evidence_id": E1,
             "action": "collected", "actor": EXAMINER, "sha256": h1, "location": "Cabinet — poste FOR-01"},
            {"event_id": "COC-003", "timestamp": "2026-09-10T09:46:35+00:00", "evidence_id": E2,
             "action": "collected", "actor": EXAMINER, "sha256": h2, "location": "Cabinet — poste FOR-01"},
            {"event_id": "COC-004", "timestamp": "2026-09-10T10:05:00+00:00", "evidence_id": E1,
             "action": "copied", "actor": EXAMINER, "sha256": h1, "location": "NAS scellé — volume PREUVES",
             "notes": "Copie de travail ; empreinte vérifiée identique."},
            {"event_id": "COC-005", "timestamp": "2026-09-11T14:00:00+00:00", "evidence_id": E1,
             "action": "verified", "actor": EXAMINER, "sha256": h1, "location": "Cabinet — poste FOR-01",
             "notes": "Re-hachage avant rapport."},
        ],
        "tool_runs": [
            {"run_id": "RUN-ALEAPP-01", "tool": TOOL_ALEAPP,
             "command": ["aleapp", "-t", "tar", "-i", "<backup extrait>", "-o", "parsed/aleapp"],
             "started_at": "2026-09-10T10:10:00+00:00", "ended_at": "2026-09-10T10:31:00+00:00",
             "status": "success", "input_evidence_ids": [E1], "output_path": "parsed/aleapp/",
             "artifacts_produced": 10},
            {"run_id": "RUN-MVT-01", "tool": TOOL_MVT,
             "command": ["mvt-android", "check-backup", "--iocs", "iocs/stalkerware.stix2", "..."],
             "started_at": "2026-09-10T10:35:00+00:00", "ended_at": "2026-09-10T10:38:00+00:00",
             "status": "success", "input_evidence_ids": [E1, E2], "output_path": "parsed/mvt/",
             "artifacts_produced": 2},
            {"run_id": "RUN-VT-01", "tool": TOOL_VT, "command": ["veritrace", "parse", "sqlite"],
             "started_at": "2026-09-10T10:40:00+00:00", "ended_at": "2026-09-10T10:40:09+00:00",
             "status": "success", "input_evidence_ids": [E1], "output_path": "parsed/veritrace-sqlite/",
             "artifacts_produced": 2},
            {"run_id": "RUN-AUTOPSY-01", "tool": {"name": "Autopsy", "version": None},
             "command": [], "started_at": "2026-09-10T10:41:00+00:00", "ended_at": "2026-09-10T10:41:00+00:00",
             "status": "skipped", "message": "Autopsy non installé sur le poste — étape ignorée.",
             "input_evidence_ids": [], "output_path": None, "artifacts_produced": 0},
        ],
        "artifacts": artifacts,
        "timeline": timeline,
        "findings": findings,
        "integrity": {
            "generated_at": "2026-09-11T14:05:00+00:00",
            "generator": {"name": "Veritrace", "version": __version__, "author": __author__},
            "audit": {"entries": 27, "head_hash": _fake_hash("audit-head"), "verified": True,
                      "verified_at": "2026-09-11T14:05:00+00:00"},
        },
    }


def example_json() -> str:
    return json.dumps(build_example(), ensure_ascii=False, indent=2) + "\n"


if __name__ == "__main__":
    sys.stdout.write(example_json())
