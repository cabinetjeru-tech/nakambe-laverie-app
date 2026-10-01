"""Document d'exemple au FORMAT PIVOT (affaire fictive), conforme au schéma.

`examples/example_case.json` est généré par ce module
(`python -m veritrace.schema.example > veritrace/schema/examples/example_case.json`) ;
un test vérifie que les deux restent identiques. Personnes, numéros, appareil et
indicateurs sont FICTIFS.

Scénario : suspicion de stalkerware sur le téléphone d'une plaignante qui consent par
écrit à l'examen. ALEAPP, MVT et le parseur SQLite de Veritrace confirment certains faits
(corroboration calculée par le moteur de corrélation réel).
"""
from __future__ import annotations

import json
import sys
from typing import Any

from veritrace import __author__, __version__
from veritrace.core.hashing import sha256_bytes
from veritrace.schema.facts import fact_hash
from veritrace.schema.pivot import SCHEMA_VERSION

ALEAPP = {"name": "ALEAPP", "version": "2026.4.2"}
MVT = {"name": "MVT", "version": "2026.9.28"}
VT = {"name": "veritrace-sqlite", "version": __version__}
REC = {"name": "veritrace-recover", "version": __version__}
EXAMINER = "Examinateur Exemple"
SPY = "com.sys.monitor.service"


def _h(label: str) -> str:
    return sha256_bytes(f"veritrace-example:{label}".encode())


def build_example() -> dict[str, Any]:
    from veritrace.correlation.engine import correlate
    from veritrace.parsing.base import new_artifact

    spy_app = {"package": SPY, "app_name": "System Service", "version_name": "4.2.1", "installer": None,
               "first_install": "2026-08-14T21:03:11+00:00", "is_system": False,
               "permissions": ["android.permission.READ_SMS", "android.permission.ACCESS_FINE_LOCATION",
                               "android.permission.RECORD_AUDIO", "android.permission.BIND_ACCESSIBILITY_SERVICE"]}
    sms = {"direction": "entrant", "address": "+22670000001", "contact_name": "Contact A",
           "body": "Je sais où tu étais hier soir.", "service": "sms", "read": True, "thread_id": 12}
    mmssms = "/data/data/com.android.providers.telephony/databases/mmssms.db"

    def art(aid, cat, ts, tool, run, item, data, fp=None, ref=None, tags=None):
        return new_artifact(artifact_id=aid, category=cat, timestamp=ts, tool=tool, item_id=item, data=data,
                            run_id=run, file_path=fp, record_ref=ref, tags=tags)

    artifacts = [
        art("ART-0001", "sms", "2026-09-02T19:44:05+00:00", ALEAPP, "RUN-ALEAPP-01", "EV-001", sms, mmssms, "sms:rowid=4471"),
        art("ART-0002", "sms", "2026-09-02T19:44:05+00:00", VT, "RUN-VT-01", "EV-001", dict(sms), mmssms, "sms:rowid=4471"),
        art("ART-0003", "appel", "2026-09-02T20:01:47+00:00", ALEAPP, "RUN-ALEAPP-01", "EV-001",
            {"direction": "manque", "number": "+22670000001", "contact_name": "Contact A", "duration_s": 0},
            "/data/data/com.android.providers.contacts/databases/calllog.db", "calls:rowid=902"),
        art("ART-0004", "application", "2026-08-14T21:03:11+00:00", ALEAPP, "RUN-ALEAPP-01", "EV-001", spy_app,
            "/data/system/packages.xml", tags=["sideload"]),
        art("ART-0005", "application", "2026-08-14T21:03:11+00:00", MVT, "RUN-MVT-01", "EV-002", dict(spy_app),
            "dumpsys package", tags=["sideload"]),
        art("ART-0006", "ioc", "2026-08-14T21:03:11+00:00", MVT, "RUN-MVT-01", "EV-002",
            {"ioc_type": "application", "ioc_value": SPY, "matched_value": SPY,
             "ioc_source": "fictivespy.stix2", "malware_family": "FictiveSpy"}, "aqf_packages", tags=["ioc"]),
        art("ART-0007", "usage_app", "2026-09-02T19:40:00+00:00", ALEAPP, "RUN-ALEAPP-01", "EV-001",
            {"package": SPY, "event": "premier_plan", "duration_s": 3.0}, "/data/system/usagestats/0/daily/"),
        art("ART-0008", "localisation", "2026-09-01T22:15:30+00:00", ALEAPP, "RUN-ALEAPP-01", "EV-001",
            {"latitude": 11.7802, "longitude": -0.3703, "accuracy_m": 12.0, "provider": "fused",
             "source_app": "com.google.android.gms"}, "/data/data/com.google.android.gms/databases/"),
        art("ART-0009", "navigation", "2026-08-14T20:58:42+00:00", ALEAPP, "RUN-ALEAPP-01", "EV-001",
            {"url": "https://download.example-monitor.invalid/apk/latest", "title": "Download", "browser": "Chrome",
             "visit_count": 1}, "/data/data/com.android.chrome/app_chrome/Default/History", "urls:id=311"),
        art("ART-0010", "wifi", "2026-09-02T18:00:00+00:00", ALEAPP, "RUN-ALEAPP-01", "EV-001",
            {"ssid": "MAISON-WIFI", "bssid": "a4:2b:b0:00:00:01", "security": "WPA2-PSK",
             "last_connected": "2026-09-02T18:00:00+00:00"},
            "/data/misc/apexdata/com.android.wifi/WifiConfigStore.xml"),
        art("ART-0011", "contact", None, VT, "RUN-VT-01", "EV-001",
            {"display_name": "Contact A", "phone_numbers": ["+22670000001"], "emails": []},
            "/data/data/com.android.providers.contacts/databases/contacts2.db", "raw_contacts:_id=55"),
        art("ART-0012", "compte", None, ALEAPP, "RUN-ALEAPP-01", "EV-001",
            {"account_type": "com.google", "account_name": "titulaire.exemple@example.invalid",
             "package": "com.google.android.gms"}, "/data/system_ce/0/accounts_ce.db"),
        art("ART-0013", "bluetooth", "2026-08-30T08:12:00+00:00", ALEAPP, "RUN-ALEAPP-01", "EV-001",
            {"mac": "00:1A:7D:00:00:02", "name": "Écouteurs BT", "paired": True,
             "last_seen": "2026-08-30T08:12:00+00:00"}, "/data/misc/bluedroid/bt_config.conf"),
    ]
    # Enregistrement récupéré hors des données actives (veritrace-recover) : SMS supprimé, lu dans un bloc libre.
    deleted_sms = {"direction": "entrant", "address": "+22670000001", "body": "Efface ce message après lecture.",
                   "service": "sms", "read": True, "thread_id": "12"}
    rec = art("ART-0014", "sms", "2026-09-02T19:46:12+00:00", REC, "RUN-REC-01", "EV-001", deleted_sms, mmssms,
              "sms:rowid inconnu — bloc libre de la page 37, décalage 0x0B2C", tags=["recupere"])
    rec["x_veritrace"]["fact_sha256"] = fact_hash("sms", deleted_sms, rec["timestamp"], "absent")
    rec["x_veritrace"]["recovery"] = {
        "status": "absent", "method": "bloc_libre", "confidence": "moyenne", "database": mmssms, "table": "sms",
        "rowid": None, "truncated": False, "locations": ["bloc libre de la page 37, décalage 0x0B2C"]}
    artifacts.append(rec)

    findings = [
        {"finding_id": "F-001", "type": "ioc", "severity": "critique", "source_tool": "MVT",
         "title": f"Présence du paquet {SPY}, référencé dans un jeu d'indicateurs de stalkerware",
         "description": (f"Le paquet {SPY} (« System Service », version 4.2.1) est installé sur l'appareil. "
                         "Il figure dans packages.xml (extraction ALEAPP) et dans la sortie dumpsys package "
                         "(analyse MVT). MVT signale une correspondance avec l'indicateur de type « application » "
                         "du fichier fictivespy.stix2, famille FictiveSpy."),
         "artifact_ids": ["ART-0004", "ART-0005", "ART-0006"], "item_ids": ["EV-001", "EV-002"], "corroborated": True,
         "ioc": {"type": "application", "value": SPY, "source": "fictivespy.stix2", "family": "FictiveSpy"},
         "x_veritrace": {
             "interpretation": ("La présence du paquet est établie par deux outils indépendants. Sa correspondance "
                                "avec un indicateur connu rend très probable qu'il s'agisse d'un logiciel de "
                                "surveillance ; son fonctionnement effectif n'a pas été analysé."),
             "plain_summary": ("Un logiciel espion connu est installé sur le téléphone. Il peut permettre à un tiers "
                               "de lire les messages et de suivre la position de l'utilisatrice."),
             "business_impact": "Exposition des communications et de la localisation de la personne concernée.",
             "confidence": "elevee", "reviewed": True,
             "remediation": [
                 {"action": "Isoler l'appareil (mode avion) et le conserver sous scellé jusqu'à la clôture des constatations.",
                  "priority": "immediat", "owner": "Responsable sécurité"},
                 {"action": "Après constatations : réinitialisation d'usine et changement de tous les mots de passe "
                            "des comptes synchronisés depuis un autre appareil sain.",
                  "priority": "court_terme", "owner": "Support informatique"}],
             "exhibits": [
                 {"exhibit_id": "PC-001", "type": "capture", "path": "parsed/exhibits/PC-001_parametres_applications.png",
                  "sha256": _h("PC-001"), "description": "Capture de l'écran Paramètres › Applications montrant « System Service ».",
                  "artifact_id": "ART-0004", "captured_at": "2026-09-10T09:00:30+00:00"},
                 {"exhibit_id": "PC-002", "type": "export", "path": "parsed/mvt/RUN-MVT-01/raw/alerts.json",
                  "sha256": _h("PC-002"), "description": "Export MVT des détections IOC.", "artifact_id": "ART-0006",
                  "captured_at": "2026-09-10T10:38:00+00:00"}]}},
        {"finding_id": "F-002", "type": "observation", "severity": "moyen", "source_tool": "examinateur",
         "title": "Message évoquant la localisation de la titulaire",
         "description": ("Le 02/09/2026 à 19:44:05 UTC, un SMS provenant de +22670000001 (« Contact A ») a été "
                         "reçu : « Je sais où tu étais hier soir. ». Une position (11.7802, -0.3703, ±12 m) est "
                         "enregistrée sur l'appareil le 01/09/2026 à 22:15:30 UTC."),
         "artifact_ids": ["ART-0001", "ART-0002", "ART-0008"], "item_ids": ["EV-001"], "corroborated": True,
         "x_veritrace": {
             "interpretation": ("La proximité temporelle entre la position enregistrée et le message est compatible "
                                "avec une exploitation des données de localisation, sans l'établir : l'expéditeur "
                                "a pu obtenir l'information par un autre moyen."),
             "plain_summary": "Un message reçu laisse penser que l'expéditeur connaît les déplacements de l'utilisatrice.",
             "confidence": "faible",
             "remediation": [{"action": "Transmettre les éléments à l'autorité compétente / au conseil juridique.",
                              "priority": "immediat", "owner": "Direction juridique"}]}},
    ]

    h1, h2, h3 = _h("backup.ab"), _h("dumpsys_package.txt"), _h("consentement.pdf")

    def item(iid, label, typ, path, sha, size, at, device_path=None):
        return {"item_id": iid, "label": label, "type": typ, "path": path, "device_path": device_path,
                "sha256": sha, "size_bytes": size, "collected_at": at, "collected_by": EXAMINER}

    def coc(eid, ts, iid, action, sha, location, notes=None):
        return {"event_id": eid, "timestamp": ts, "item_id": iid, "action": action, "actor": EXAMINER,
                "sha256": sha, "location": location, "notes": notes}

    doc = {
        "case": {
            "case_id": "VT-2026-0042",
            "title": "Suspicion de logiciel espion — téléphone de la plaignante",
            "examiner": EXAMINER,
            "created_at": "2026-09-10T08:30:00+00:00",
            "authorization": {
                "type": "consentement", "reference": "PV-CONS-2026-0042 — consentement signé par la titulaire",
                "confirmed_by": EXAMINER, "confirmed_at": "2026-09-10T08:25:00+00:00",
                "x_veritrace": {"issued_by": "Titulaire de l'appareil", "issued_at": "2026-09-10T08:00:00+00:00",
                                "scope": "Acquisition logique complète ; données du 01/08/2026 au 10/09/2026.",
                                "document_sha256": h3}},
            "x_veritrace": {
                "report_type": "judiciaire",
                "display_timezone": "Africa/Ouagadougou",
                "mission": ("Rechercher la présence d'un logiciel espion ou de harcèlement (stalkerware) sur le "
                            "téléphone remis, et établir la chronologie de son installation et de son activité."),
                "executive_summary": (
                    "Un logiciel de surveillance connu est installé sur le téléphone examiné. Il a été installé "
                    "manuellement le 14 août 2026, hors magasin d'applications, et dispose d'accès aux SMS, à la "
                    "position et au micro. Un message reçu le 2 septembre suggère que son expéditeur connaît les "
                    "déplacements de l'utilisatrice. L'appareil doit être isolé et conservé en l'état ; les comptes "
                    "associés doivent être sécurisés depuis un appareil sain."),
                "limitations": [
                    "Acquisition logique uniquement : les données des applications excluant la sauvegarde ADB "
                    "(allowBackup=false) ne sont pas couvertes.",
                    "Aucune donnée supprimée n'a été récupérée (pas d'acquisition physique)."],
                "examiner_role": "Expert en investigation numérique",
                "examiner_qualification": "Certification forensique mobile (exemple)",
                "requesting_party": {"name": "Parquet du Tribunal (fictif)", "role": "Autorité requérante",
                                     "reference": "RP-2026-1187"},
                "organization": {"name": "Cabinet d'expertise (à personnaliser)", "address": "Adresse du cabinet, Ville, Pays",
                                 "phone": "+226 00 00 00 00", "email": "contact@cabinet.example",
                                 "website": "https://cabinet.example", "registration": "Expert agréé n° 0000",
                                 "logo_path": None}}},
        "device": {
            "manufacturer": "Samsung", "model": "Galaxy A54 (SM-A546B)", "os_version": "14",
            "security_patch": "2026-07-01",
            "build_fingerprint": "samsung/a54xnseea/a54x:14/UP1A.231005.007/A546BXXS8BXF1:user/release-keys",
            "serial": "R5CW0000000", "imei": ["350000000000001"], "owner": "Plaignante (identité au dossier)",
            "seal_number": "SC-2026-0042-A",
            "state_on_receipt": "Allumé, déverrouillé par la titulaire, débogage USB activé par elle"},
        "acquisitions": [
            {"acquisition_id": "ACQ-01", "method": "import", "tool": {"name": "veritrace", "version": __version__},
             "operator": EXAMINER, "started_at": "2026-09-10T08:20:00+00:00", "ended_at": "2026-09-10T08:20:00+00:00",
             "status": "succes", "notes": "Numérisation du PV de consentement signé.",
             "items": [item("EV-003", "PV de consentement signé (scan)", "document", "custody/documents/consentement.pdf",
                            h3, 184_320, "2026-09-10T08:20:00+00:00")]},
            {"acquisition_id": "ACQ-02", "method": "adb_backup", "tool": {"name": "adb", "version": "35.0.2"},
             "operator": EXAMINER, "started_at": "2026-09-10T09:02:00+00:00", "ended_at": "2026-09-10T09:41:00+00:00",
             "status": "succes", "notes": "Sauvegarde confirmée sur l'appareil par la titulaire.",
             "items": [item("EV-001", "Sauvegarde ADB complète", "sauvegarde", "acquisition/raw/ACQ-02/backup.ab",
                            h1, 3_221_225_472, "2026-09-10T09:41:00+00:00", "adb backup -all")]},
            {"acquisition_id": "ACQ-03", "method": "adb_dumpsys", "tool": {"name": "adb", "version": "35.0.2"},
             "operator": EXAMINER, "started_at": "2026-09-10T09:45:00+00:00", "ended_at": "2026-09-10T09:46:30+00:00",
             "status": "succes", "notes": "",
             "items": [item("EV-002", "État du service « package » (dumpsys)", "fichier",
                            "acquisition/raw/ACQ-03/dumpsys_package.txt", h2, 2_457_600, "2026-09-10T09:46:30+00:00",
                            "dumpsys package")]},
        ],
        "artifacts": artifacts,
        "findings": findings,
        "timeline": [],
        "chain_of_custody": [
            coc("COC-001", "2026-09-10T08:20:00+00:00", "EV-003", "collecte", h3, "Cabinet — bureau 2"),
            coc("COC-002", "2026-09-10T09:41:05+00:00", "EV-001", "collecte", h1, "Cabinet — poste FOR-01"),
            coc("COC-003", "2026-09-10T09:46:35+00:00", "EV-002", "collecte", h2, "Cabinet — poste FOR-01"),
            coc("COC-004", "2026-09-10T10:05:00+00:00", "EV-001", "copie", h1, "NAS scellé — volume PREUVES",
                "Copie de travail ; empreinte vérifiée identique."),
            coc("COC-005", "2026-09-10T10:10:00+00:00", "EV-001", "analyse", h1, "Cabinet — poste FOR-01", "Analyse ALEAPP 2026.4.2."),
            coc("COC-006", "2026-09-11T14:00:00+00:00", "EV-001", "verification", h1, "Cabinet — poste FOR-01",
                "Re-hachage avant rapport."),
        ],
        "x_veritrace": {
            "schema_version": SCHEMA_VERSION,
            "tool_runs": [
                {"run_id": "RUN-ALEAPP-01", "tool": "ALEAPP", "tool_version": "2026.4.2", "mode": "execute",
                 "command": ["aleapp.py", "-t", "tar", "-i", "<backup extrait>", "-o", "parsed/aleapp/RUN-ALEAPP-01/raw"],
                 "started_at": "2026-09-10T10:10:00+00:00", "ended_at": "2026-09-10T10:31:00+00:00", "status": "succes",
                 "message": "Format lu : LAVA.", "input_item_ids": ["EV-001"],
                 "output_path": "parsed/aleapp/RUN-ALEAPP-01/", "artifacts_produced": 10},
                {"run_id": "RUN-MVT-01", "tool": "MVT", "tool_version": "2026.9.28", "mode": "execute",
                 "command": ["mvt-android", "check-androidqf", "-i", "custody/iocs/fictivespy.stix2", "..."],
                 "started_at": "2026-09-10T10:35:00+00:00", "ended_at": "2026-09-10T10:38:00+00:00", "status": "succes",
                 "message": "1 détection(s) IOC.", "input_item_ids": ["EV-002"], "output_path": "parsed/mvt/RUN-MVT-01/",
                 "artifacts_produced": 2},
                {"run_id": "RUN-VT-01", "tool": "veritrace-sqlite", "tool_version": __version__, "mode": "execute",
                 "command": ["veritrace", "parse", "sqlite"], "started_at": "2026-09-10T10:40:00+00:00",
                 "ended_at": "2026-09-10T10:40:09+00:00", "status": "succes", "message": "",
                 "input_item_ids": ["EV-001"], "output_path": "parsed/veritrace-sqlite/RUN-VT-01/",
                 "artifacts_produced": 2},
                {"run_id": "RUN-REC-01", "tool": "veritrace-recover", "tool_version": __version__,
                 "mode": "execute", "command": ["veritrace", "parse", "recover"],
                 "started_at": "2026-09-10T10:40:10+00:00", "ended_at": "2026-09-10T10:40:12+00:00",
                 "status": "succes", "message": "1 base(s) examinée(s) ; 1 enregistrement(s) absent(s) des données "
                 "actives et 0 version(s) antérieure(s) récupéré(s).", "input_item_ids": ["EV-001"],
                 "output_path": "parsed/veritrace-recover/RUN-REC-01/", "artifacts_produced": 1},
                {"run_id": "RUN-AUTOPSY-01", "tool": "Autopsy", "tool_version": None, "mode": None, "command": [],
                 "started_at": "2026-09-10T10:41:00+00:00", "ended_at": "2026-09-10T10:41:00+00:00", "status": "ignore",
                 "message": "Aucun cas Autopsy fourni — étape non exécutée.", "input_item_ids": [], "output_path": None,
                 "artifacts_produced": 0},
            ],
            "recovery": [
                {"run_id": "RUN-REC-01", "item_id": "EV-001", "database": mmssms, "page_size": 4096, "pages": 212,
                 "auto_vacuum": False, "wal_frames": 0, "wal_committed_frames": 0, "journal": None,
                 "journal_pages": 0, "freelist_pages": 0, "free_bytes": 18322, "nonzero_free_bytes": 1210,
                 "secure_delete_observed": False, "recovered_absent": 1, "recovered_previous": 0,
                 "already_active": 3, "ambiguous": 0, "by_method": {"bloc_libre": 1}, "notes": []}],
            "integrity": {"generated_at": "2026-09-11T14:05:00+00:00",
                          "generator": {"name": "Veritrace", "version": __version__, "author": __author__},
                          "audit": {"entries": 27, "head_hash": _h("audit-head"), "verified": True,
                                    "verified_at": "2026-09-11T14:05:00+00:00"}},
        },
    }
    correlate(doc)
    return doc


def example_json() -> str:
    return json.dumps(build_example(), ensure_ascii=False, indent=2) + "\n"


if __name__ == "__main__":
    sys.stdout.write(example_json())
