"""Corrélation inter-outils.

Étapes (toutes déterministes, ré-exécutables sans effet de bord cumulatif) :

1. **Corroboration** — les artefacts sont regroupés par `fact_sha256`. Un fait extrait
   par au moins deux *moteurs* distincts est « corroboré » ; chaque artefact du groupe
   reçoit la liste complète des sources. Le moteur d'Autopsy exécutant son module aLEAPP
   est « ALEAPP » : il ne corrobore donc pas ALEAPP (sources non indépendantes).
2. **Dédoublonnage** — un fait n'apparaît qu'UNE fois dans la timeline et dans les
   inventaires, quel que soit le nombre d'outils qui l'ont extrait.
3. **Timeline** — un événement par fait horodaté. Les événements générés portent un
   identifiant `TL-A-…` et sont régénérés à chaque corrélation ; les événements saisis à la
   main (autre préfixe) sont conservés tels quels.
4. **Rattachement des constats** — un constat IOC (paquet, domaine) est relié aux
   artefacts d'autres outils décrivant le même élément (application installée, usage,
   navigation) ; sa fiabilité devient « corroboré » si l'un de ses artefacts l'est.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from veritrace.core.timeutil import parse_iso
from veritrace.schema.describe import artifact_summary
from veritrace.schema.validator import artifact_engine

AUTO_PREFIX = "TL-A-"


@dataclass
class CorrelationSummary:
    artifacts: int
    facts: int
    corroborated_facts: int
    merged_duplicates: int
    timeline_events: int
    findings_linked: int

    def as_dict(self) -> dict[str, int]:
        return self.__dict__.copy()


def _groups(artifacts: list[dict]) -> dict[str, list[dict]]:
    g: dict[str, list[dict]] = defaultdict(list)
    for a in artifacts:
        g[a["fact_sha256"]].append(a)
    return g


def refresh_corroboration(artifacts: list[dict]) -> dict[str, list[dict]]:
    """Recalcule `corroboration` de chaque artefact ; renvoie les groupes par fait."""
    groups = _groups(artifacts)
    for group in groups.values():
        sources = [{"tool": a["source"]["tool"]["name"], "artifact_id": a["artifact_id"],
                    "engine": artifact_engine(a)} for a in group]
        status = "corroborated" if len({s["engine"] for s in sources}) >= 2 else "single_source"
        for a in group:
            mine = sources if status == "corroborated" else [s for s in sources if s["artifact_id"] == a["artifact_id"]]
            a["corroboration"] = {"status": status, "sources": mine}
    return groups


def _host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except ValueError:
        return ""


def _ioc_index(artifacts: list[dict]) -> tuple[set[str], set[str]]:
    pkgs, domains = set(), set()
    for a in artifacts:
        if a["category"] != "ioc_match":
            continue
        d = a["data"]
        if d.get("indicator_type") == "package":
            pkgs.add((d.get("indicator") or "").lower())
        elif d.get("indicator_type") in ("domain", "url"):
            v = d.get("indicator") or ""
            domains.add(_host(v) if "://" in v else v.lower())
    return pkgs, domains


def _domain_match(host: str, domains: set[str]) -> bool:
    return any(host == d or host.endswith("." + d) for d in domains if d)


def related_to_iocs(a: dict, pkgs: set[str], domains: set[str]) -> bool:
    d = a["data"]
    if a["category"] in ("installed_app", "app_usage"):
        return (d.get("package") or "").lower() in pkgs
    if a["category"] == "browser_history":
        return _domain_match(_host(d.get("url") or ""), domains)
    return False


def _flags(group: list[dict], pkgs: set[str], domains: set[str]) -> list[str]:
    flags: list[str] = []
    a = group[0]
    if a["category"] == "ioc_match" or any(related_to_iocs(x, pkgs, domains) for x in group):
        flags.append("ioc")
    if a["category"] == "installed_app":
        sideload = all(not x["data"].get("installer") for x in group)
        system = any(x["data"].get("is_system") for x in group)
        if sideload and not system:
            flags.append("suspicious_app")
    if a["category"] == "app_usage" and (a["data"].get("package") or "").lower() in pkgs:
        flags.append("suspicious_app")
    return flags


def _best(group: list[dict]) -> dict:
    """Artefact le plus renseigné du groupe (sert au libellé de l'événement)."""
    return max(group, key=lambda a: sum(1 for v in a["data"].values() if v not in (None, "", [])))


def build_timeline(doc: dict[str, Any], groups: dict[str, list[dict]]) -> list[dict]:
    pkgs, domains = _ioc_index(doc["artifacts"])
    manual = [t for t in doc["timeline"] if not t["event_id"].startswith(AUTO_PREFIX)]
    events = []
    for fact, group in groups.items():
        stamped = [a for a in group if a.get("timestamp")]
        if not stamped:
            continue
        first = min(stamped, key=lambda a: parse_iso(a["timestamp"]))
        engines = sorted({artifact_engine(a) for a in group})
        events.append({
            "event_id": f"{AUTO_PREFIX}{fact[:16]}",
            "timestamp": first["timestamp"],
            "category": first["category"],
            "summary": artifact_summary(_best(group)),
            "artifact_ids": [a["artifact_id"] for a in group],
            "corroborated": len(engines) >= 2,
            "sources": sorted({a["source"]["tool"]["name"] for a in group}),
            "flags": _flags(group, pkgs, domains),
        })
    events.sort(key=lambda e: (parse_iso(e["timestamp"]), e["event_id"]))
    return manual + events


def link_findings(doc: dict[str, Any]) -> int:
    """Rattache aux constats IOC les artefacts d'autres outils décrivant le même élément."""
    by_id = {a["artifact_id"]: a for a in doc["artifacts"]}
    linked = 0
    for f in doc["findings"]:
        own = [by_id[x] for x in f.get("artifact_ids", []) if x in by_id]
        pkgs, domains = _ioc_index(own)
        if pkgs or domains:
            for a in doc["artifacts"]:
                if a["artifact_id"] not in f["artifact_ids"] and related_to_iocs(a, pkgs, domains):
                    f["artifact_ids"].append(a["artifact_id"])
                    linked += 1
            evs = list(dict.fromkeys(list(f.get("evidence_ids") or []) +
                                     [by_id[x]["source"]["evidence_id"] for x in f["artifact_ids"] if x in by_id]))
            f["evidence_ids"] = evs
        f["corroborated"] = any(by_id[x]["corroboration"]["status"] == "corroborated"
                                for x in f.get("artifact_ids", []) if x in by_id)
    return linked


def correlate(doc: dict[str, Any]) -> CorrelationSummary:
    groups = refresh_corroboration(doc["artifacts"])
    doc["timeline"] = build_timeline(doc, groups)
    linked = link_findings(doc)
    return CorrelationSummary(
        artifacts=len(doc["artifacts"]),
        facts=len(groups),
        corroborated_facts=sum(1 for g in groups.values() if len({artifact_engine(a) for a in g}) >= 2),
        merged_duplicates=sum(len(g) - 1 for g in groups.values()),
        timeline_events=sum(1 for t in doc["timeline"] if t["event_id"].startswith(AUTO_PREFIX)),
        findings_linked=linked,
    )
