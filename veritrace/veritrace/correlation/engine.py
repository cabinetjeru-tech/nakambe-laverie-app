"""Corrélation inter-outils sur le format pivot.

1. **Corroboration** — les artefacts sont regroupés par empreinte de fait
   (`x_veritrace.fact_sha256`, recalculée si absente). Un fait extrait par au moins deux
   *moteurs* distincts est corroboré : `corroborated = true`, `corroborated_by` = outils.
   Autopsy exécutant son module aLEAPP a le moteur « ALEAPP » : il ne corrobore pas ALEAPP.
2. **Dédoublonnage** — un fait n'apparaît qu'UNE fois dans la timeline et les inventaires.
3. **Timeline** — un événement par fait horodaté (`x_veritrace.generated = true`, régénéré
   à chaque passage) ; les événements saisis à la main sont conservés.
4. **Règles de détection** (`rules.py`) — R1 à R6, constats régénérés à chaque passage.
   Les enregistrements récupérés hors des données actives ont leur propre empreinte de
   fait (statut inclus) : ils ne corroborent jamais un fait actif et portent le drapeau
   `recupere` dans la timeline.
5. **Rattachement des constats** — un constat IOC est relié aux artefacts d'autres outils
   décrivant le même élément (application, usage, domaine visité) ; il est corroboré si
   l'un de ses artefacts l'est.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from veritrace.core.timeutil import parse_iso
from veritrace.schema.describe import artifact_summary
from veritrace.schema.pivot import engine, ext, ext_set, fact_sha, recovery

AUTO_PREFIX = "TL-A-"


@dataclass
class CorrelationSummary:
    artifacts: int
    facts: int
    corroborated_facts: int
    merged_duplicates: int
    timeline_events: int
    findings_linked: int
    rule_findings: int = 0

    def as_dict(self) -> dict[str, int]:
        return self.__dict__.copy()


def refresh_corroboration(artifacts: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for a in artifacts:
        ext_set(a, fact_sha256=fact_sha(a))
        groups[a["x_veritrace"]["fact_sha256"]].append(a)
    for group in groups.values():
        sources = [{"artifact_id": a["artifact_id"], "tool": a["source"]["tool"], "engine": engine(a)} for a in group]
        corroborated = len({s["engine"] for s in sources}) >= 2
        tools = sorted({s["tool"] for s in sources})
        for a in group:
            a["corroborated"] = corroborated
            a["corroborated_by"] = tools if corroborated else [a["source"]["tool"]]
            a["x_veritrace"]["sources"] = sources if corroborated else [
                s for s in sources if s["artifact_id"] == a["artifact_id"]]
    return groups


def _host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except ValueError:
        return ""


def _ioc_index(artifacts: list[dict]) -> tuple[set[str], set[str]]:
    pkgs, domains = set(), set()
    for a in artifacts:
        if a["category"] != "ioc":
            continue
        d = a["data"]
        v = (d.get("ioc_value") or "").lower()
        if d.get("ioc_type") == "application":
            pkgs.add(v)
        elif d.get("ioc_type") in ("domaine", "url"):
            domains.add(_host(v) if "://" in v else v)
    return pkgs, domains


def related_to_iocs(a: dict, pkgs: set[str], domains: set[str]) -> bool:
    d = a["data"]
    if a["category"] in ("application", "usage_app"):
        return (d.get("package") or "").lower() in pkgs
    if a["category"] == "navigation":
        host = _host(d.get("url") or "")
        return any(host == x or host.endswith("." + x) for x in domains if x)
    return False


def _flags(group: list[dict], pkgs: set[str], domains: set[str],
           flagged: dict[str, set[str]] | None = None) -> list[str]:
    flags: list[str] = []
    for a in group:  # artefacts cités par un constat de règle
        for fl in sorted((flagged or {}).get(a["artifact_id"], ())):  # ordre déterministe
            if fl not in flags:
                flags.append(fl)
    a = group[0]
    if a["category"] == "ioc" or any(related_to_iocs(x, pkgs, domains) for x in group):
        if "ioc" not in flags:
            flags.append("ioc")
    if a["category"] == "application" and "application_suspecte" not in flags:
        if all(not x["data"].get("installer") for x in group) and not any(x["data"].get("is_system") for x in group):
            flags.append("application_suspecte")
    if a["category"] == "usage_app" and (a["data"].get("package") or "").lower() in pkgs \
            and "application_suspecte" not in flags:
        flags.append("application_suspecte")
    if any(recovery(x) for x in group):
        flags.append("recupere")
    return flags


def _best(group: list[dict]) -> dict:
    return max(group, key=lambda a: sum(1 for v in a["data"].values() if v not in (None, "", [])))


def build_timeline(doc: dict[str, Any], groups: dict[str, list[dict]]) -> list[dict]:
    pkgs, domains = _ioc_index(doc["artifacts"])
    flagged: dict[str, set[str]] = defaultdict(set)
    for f in doc["findings"]:
        if f["type"] in ("anomalie", "application_suspecte"):
            for aid in f["artifact_ids"]:
                flagged[aid].add(f["type"])
    manual = [t for t in doc["timeline"] if not ext(t).get("generated")]
    events = []
    for fact, group in groups.items():
        stamped = [a for a in group if a.get("timestamp")]
        if not stamped:
            continue
        first = min(stamped, key=lambda a: parse_iso(a["timestamp"]))
        events.append({
            "event_id": f"{AUTO_PREFIX}{fact[:16]}",
            "timestamp": first["timestamp"],
            "category": first["category"],
            "description": artifact_summary(_best(group)),
            "artifact_ids": [a["artifact_id"] for a in group],
            "corroborated": group[0]["corroborated"],
            "sources": sorted({a["source"]["tool"] for a in group}),
            "x_veritrace": {"generated": True, "flags": _flags(group, pkgs, domains, flagged)},
        })
    events.sort(key=lambda e: (parse_iso(e["timestamp"]), e["event_id"]))
    return manual + events


def link_findings(doc: dict[str, Any]) -> int:
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
        f["item_ids"] = list(dict.fromkeys(list(f.get("item_ids") or []) +
                                           [by_id[x]["source"]["item_id"] for x in f["artifact_ids"] if x in by_id]))
        f["corroborated"] = any(by_id[x]["corroborated"] for x in f.get("artifact_ids", []) if x in by_id)
    return linked


def correlate(doc: dict[str, Any]) -> CorrelationSummary:
    from veritrace.correlation.rules import run_rules

    groups = refresh_corroboration(doc["artifacts"])
    rule_findings = run_rules(doc)
    doc["timeline"] = build_timeline(doc, groups)
    linked = link_findings(doc)
    return CorrelationSummary(
        artifacts=len(doc["artifacts"]), facts=len(groups),
        corroborated_facts=sum(1 for g in groups.values() if g[0]["corroborated"]),
        merged_duplicates=sum(len(g) - 1 for g in groups.values()),
        timeline_events=sum(1 for t in doc["timeline"] if ext(t).get("generated")),
        findings_linked=linked,
        rule_findings=rule_findings,
    )
