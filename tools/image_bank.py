#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import html
import json
import mimetypes
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import unicodedata
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

OPENVERSE_API = "https://api.openverse.org/v1/images/"
WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "LGC-Portail-ImageBank/1.0 (educational image curation)"
DEFAULT_LICENSES = {"cc0", "pdm", "by", "by-sa", "public domain"}
MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024
MIN_VERIFIED_POOL_FOR_SUGGESTION = 3


@dataclass
class Candidate:
    candidate_id: str
    concept_id: str
    provider: str
    provider_id: str
    query: str
    title: str
    creator: str
    source_name: str
    source_url: str
    asset_url: str
    license: str
    license_url: str
    width: int | None = None
    height: int | None = None
    local_file: str = ""
    file_sha256: str = ""
    file_bytes: int = 0
    license_confidence: str = "unknown"
    review_required: bool = True


def _slug(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip("-")
    return value[:80] or "candidate"


def _strip_html(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value or "")
    return " ".join(html.unescape(value).split())


def _fold_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    return "".join(ch for ch in normalized if not unicodedata.combining(ch)).casefold()


def concept_keywords(concept: dict) -> list[str]:
    labels = concept.get("labels") or {}
    values = [
        str(labels.get("en") or ""),
        str(labels.get("fr") or ""),
        str(concept.get("id") or "").replace("_", " "),
    ]
    keywords: list[str] = []
    for value in values:
        for token in re.findall(r"[a-zA-ZÀ-ÿ]+", value):
            folded = _fold_text(token)
            if len(folded) >= 3 and folded not in keywords:
                keywords.append(folded)
    return keywords


def title_relevant(title: str, concept: dict) -> bool:
    text = _fold_text(title)
    for token in concept_keywords(concept):
        if len(token) <= 3:
            if re.search(rf"(?<![a-z0-9]){re.escape(token)}s?(?![a-z0-9])", text):
                return True
        elif token in text:
            return True
    return False


SUSPICIOUS_TITLE_WORDS = {
    "logo", "poster", "diagram", "map", "chart", "screenshot",
    "painting", "artwork", "trophy", "award", "sign", "banner",
}


def candidate_requires_review(candidate: Candidate) -> bool:
    license_key = _license_key(candidate.license)
    return bool(
        candidate.review_required
        or (license_key in {"by", "by-sa"} and not candidate.creator)
    )


def candidate_score(candidate: Candidate, concept: dict) -> int:
    score = 0
    license_key = _license_key(candidate.license)
    score += {"cc0": 18, "pdm": 18, "by": 13, "by-sa": 9}.get(license_key, 0)
    if candidate.license_confidence == "source-metadata":
        score += 18
    elif candidate.license_confidence == "aggregated-metadata":
        score += 4
    if not candidate_requires_review(candidate):
        score += 12
    else:
        score -= 28
    if license_key in {"by", "by-sa"} and not candidate.creator:
        score -= 24
    if candidate.provider == "wikimedia":
        score += 3
    if title_relevant(candidate.title, concept):
        score += 12

    width = candidate.width or 0
    height = candidate.height or 0
    if width >= 400 and height >= 300:
        score += 7
    if width and height:
        ratio = width / height
        if 0.55 <= ratio <= 1.8:
            score += 4
        if min(width, height) < 180:
            score -= 8

    title_folded = _fold_text(candidate.title)
    if any(word in title_folded for word in SUSPICIOUS_TITLE_WORDS):
        score -= 12
    if candidate.creator:
        score += 2
    if candidate.source_url:
        score += 2
    if candidate.local_file:
        score += 2
    return score


def recommended_candidates(
    concepts: list[dict], candidates: list[Candidate]
) -> dict[str, tuple[str, int]]:
    concept_map = {item["id"]: item for item in concepts}
    grouped: dict[str, list[Candidate]] = {}
    for candidate in candidates:
        grouped.setdefault(candidate.concept_id, []).append(candidate)
    recommendations: dict[str, tuple[str, int]] = {}
    for concept_id, items in grouped.items():
        concept = concept_map.get(
            concept_id,
            {"id": concept_id, "labels": {"fr": concept_id, "en": concept_id}},
        )
        verified_pool = [
            item for item in items
            if item.license_confidence == "source-metadata"
            and not candidate_requires_review(item)
        ]
        if len(verified_pool) < MIN_VERIFIED_POOL_FOR_SUGGESTION:
            continue
        ranked = sorted(
            items,
            key=lambda item: (
                candidate_score(item, concept),
                item.provider == "wikimedia",
                item.candidate_id,
            ),
            reverse=True,
        )
        if ranked:
            best = ranked[0]
            recommendations[concept_id] = (
                best.candidate_id,
                candidate_score(best, concept),
            )
    return recommendations


def _json_get(url: str, params: dict[str, object], *, timeout: int = 20) -> dict:
    query = urllib.parse.urlencode(params, doseq=True)
    request = urllib.request.Request(
        url + ("&" if "?" in url else "?") + query,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _license_key(value: str) -> str:
    value = (value or "").strip().lower()
    value = value.replace("creative commons", "").replace("license", "")
    value = re.sub(r"\s+", " ", value).strip(" -")
    if value in {"public domain mark", "public domain", "pdm"}:
        return "pdm"
    if "cc0" in value or value == "zero":
        return "cc0"
    if "by-sa" in value or "attribution-sharealike" in value:
        return "by-sa"
    if re.search(r"(^|\s)by($|\s)", value) or "attribution" in value:
        return "by"
    return value


def normalize_openverse(result: dict, concept_id: str, query: str) -> Candidate | None:
    asset_url = str(result.get("thumbnail") or result.get("url") or "").strip()
    provider_id = str(result.get("id") or "").strip()
    if not asset_url or not provider_id:
        return None
    license_code = str(result.get("license") or "").strip().lower()
    license_version = str(result.get("license_version") or "").strip()
    license_label = " ".join(part for part in [license_code.upper(), license_version] if part).strip()
    return Candidate(
        candidate_id=f"openverse:{provider_id}",
        concept_id=concept_id,
        provider="openverse",
        provider_id=provider_id,
        query=query,
        title=str(result.get("title") or ""),
        creator=str(result.get("creator") or ""),
        source_name=str(result.get("source") or result.get("provider") or "Openverse"),
        source_url=str(
            result.get("foreign_landing_url")
            or result.get("detail_url")
            or result.get("url")
            or ""
        ),
        asset_url=asset_url,
        license=license_label or license_code,
        license_url=str(result.get("license_url") or ""),
        width=_int_or_none(result.get("width")),
        height=_int_or_none(result.get("height")),
        license_confidence="aggregated-metadata",
        review_required=True,
    )


def normalize_wikimedia(page: dict, concept_id: str, query: str) -> Candidate | None:
    imageinfo = (page.get("imageinfo") or [None])[0]
    if not isinstance(imageinfo, dict):
        return None
    metadata = imageinfo.get("extmetadata") or {}

    def meta(name: str) -> str:
        field = metadata.get(name) or {}
        return _strip_html(str(field.get("value") or ""))

    provider_id = str(page.get("pageid") or page.get("title") or "").strip()
    asset_url = str(imageinfo.get("thumburl") or imageinfo.get("url") or "").strip()
    if not provider_id or not asset_url:
        return None
    license_name = meta("LicenseShortName") or meta("UsageTerms")
    license_url = meta("LicenseUrl")
    creator = meta("Artist") or meta("Credit")
    license_key = _license_key(license_name)
    review_required = (
        license_key not in DEFAULT_LICENSES
        or (license_key in {"by", "by-sa"} and not creator)
    )
    return Candidate(
        candidate_id=f"wikimedia:{provider_id}",
        concept_id=concept_id,
        provider="wikimedia",
        provider_id=provider_id,
        query=query,
        title=str(page.get("title") or "").removeprefix("File:"),
        creator=creator,
        source_name="Wikimedia Commons",
        source_url=str(imageinfo.get("descriptionurl") or imageinfo.get("url") or ""),
        asset_url=asset_url,
        license=license_name,
        license_url=license_url,
        width=_int_or_none(imageinfo.get("thumbwidth") or imageinfo.get("width")),
        height=_int_or_none(imageinfo.get("thumbheight") or imageinfo.get("height")),
        license_confidence="source-metadata",
        review_required=review_required,
    )


def _int_or_none(value: object) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def concept_queries(concept: dict) -> list[str]:
    queries = concept.get("queries")
    values: list[str] = []
    if isinstance(queries, list):
        values.extend(str(item).strip() for item in queries if str(item).strip())
    labels = concept.get("labels") or {}
    values.extend(
        str(labels.get(key) or "").strip()
        for key in ("en", "fr")
        if str(labels.get(key) or "").strip()
    )
    values.append(str(concept["id"]).replace("_", " "))
    unique: list[str] = []
    for value in values:
        if value and value.casefold() not in {item.casefold() for item in unique}:
            unique.append(value)
    return unique


def search_openverse(concept: dict, limit: int) -> list[Candidate]:
    found: list[Candidate] = []
    seen: set[str] = set()
    for query in concept_queries(concept):
        payload = _json_get(
            OPENVERSE_API,
            {"q": query, "page_size": min(max(limit * 5, 20), 80)},
        )
        for result in payload.get("results") or []:
            candidate = normalize_openverse(result, concept["id"], query)
            if not candidate or _license_key(candidate.license) not in DEFAULT_LICENSES:
                continue
            if candidate.candidate_id in seen:
                continue
            seen.add(candidate.candidate_id)
            found.append(candidate)
            if len(found) >= limit:
                return found
    return found


def search_wikimedia(concept: dict, limit: int) -> list[Candidate]:
    found: list[Candidate] = []
    seen: set[str] = set()
    for query in concept_queries(concept):
        payload = _json_get(
            WIKIMEDIA_API,
            {
                "action": "query",
                "format": "json",
                "formatversion": "2",
                "generator": "search",
                "gsrsearch": query,
                "gsrnamespace": 6,
                "gsrlimit": min(max(limit * 5, 20), 50),
                "prop": "imageinfo",
                "iiprop": "url|size|extmetadata",
                "iiurlwidth": 480,
            },
        )
        for page in (payload.get("query") or {}).get("pages") or []:
            candidate = normalize_wikimedia(page, concept["id"], query)
            if not candidate or _license_key(candidate.license) not in DEFAULT_LICENSES:
                continue
            if candidate.title.casefold().endswith(".gif"):
                continue
            if not title_relevant(candidate.title, concept):
                continue
            if candidate.candidate_id in seen:
                continue
            seen.add(candidate.candidate_id)
            found.append(candidate)
            if len(found) >= limit:
                return found
    return found


def preferred_query(concept: dict) -> str:
    return concept_queries(concept)[0]


def load_concepts(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    concepts = payload.get("concepts") if isinstance(payload, dict) else payload
    if not isinstance(concepts, list):
        raise ValueError("Le manifeste doit contenir une liste 'concepts'.")
    seen: set[str] = set()
    normalized: list[dict] = []
    for raw in concepts:
        if not isinstance(raw, dict):
            continue
        concept_id = str(raw.get("id") or "").strip()
        labels = raw.get("labels") or {}
        if not concept_id or concept_id in seen or not isinstance(labels, dict):
            raise ValueError(f"Concept invalide ou dupliqué: {concept_id!r}")
        seen.add(concept_id)
        normalized.append(raw)
    return normalized


def _guess_extension(url: str, content_type: str = "") -> str:
    ext = Path(urllib.parse.urlparse(url).path).suffix.lower()
    if ext in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        return ".jpg" if ext == ".jpeg" else ext
    guessed = mimetypes.guess_extension(content_type.partition(";")[0].strip()) or ".jpg"
    return ".jpg" if guessed == ".jpe" else guessed


def download_asset(candidate: Candidate, workspace: Path) -> bool:
    folder = workspace / "candidates" / candidate.concept_id / candidate.provider
    folder.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(candidate.asset_url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            content_type = response.headers.get("Content-Type", "")
            if content_type and not content_type.startswith("image/"):
                return False
            data = response.read(MAX_DOWNLOAD_BYTES + 1)
    except (OSError, urllib.error.URLError, urllib.error.HTTPError):
        return False
    if len(data) > MAX_DOWNLOAD_BYTES or len(data) < 256:
        return False
    ext = _guess_extension(candidate.asset_url, content_type)
    digest = hashlib.sha256(candidate.candidate_id.encode("utf-8")).hexdigest()[:12]
    target = folder / f"{_slug(candidate.provider_id)}-{digest}{ext}"
    target.write_bytes(data)
    candidate.local_file = target.relative_to(workspace).as_posix()
    candidate.file_sha256 = hashlib.sha256(data).hexdigest()
    candidate.file_bytes = len(data)
    return True


def write_workspace_state(
    workspace: Path,
    manifest: Path,
    providers: list[str],
    concepts: list[dict],
    candidates: list[Candidate],
    failures: list[dict],
) -> None:
    payload = {
        "version": 1,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "manifest": str(manifest),
        "providers": providers,
        "concepts": concepts,
        "candidates": [asdict(item) for item in candidates],
        "failures": failures,
    }
    (workspace / "candidates.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    write_gallery(workspace, concepts, candidates)


def collect(args: argparse.Namespace) -> int:
    manifest = Path(args.manifest)
    workspace = Path(args.output)
    if args.fresh and workspace.exists():
        shutil.rmtree(workspace)
    workspace.mkdir(parents=True, exist_ok=True)
    concepts = load_concepts(manifest)
    if args.ids:
        requested = {item.strip() for item in args.ids.split(",") if item.strip()}
        concepts = [item for item in concepts if item["id"] in requested]
    providers = [item.strip() for item in args.providers.split(",") if item.strip()]
    unknown = set(providers) - {"openverse", "wikimedia"}
    if unknown:
        raise ValueError(f"Provider(s) inconnu(s): {', '.join(sorted(unknown))}")

    candidates: list[Candidate] = []
    failures: list[dict] = []
    state_path = workspace / "candidates.json"
    if state_path.exists() and not args.fresh:
        previous = json.loads(state_path.read_text(encoding="utf-8"))
        for raw in previous.get("candidates") or []:
            try:
                candidates.append(Candidate(**raw))
            except TypeError:
                continue
        failures.extend(previous.get("failures") or [])

    searchers = {"openverse": search_openverse, "wikimedia": search_wikimedia}
    known_ids = {item.candidate_id for item in candidates}
    for concept in concepts:
        for provider in providers:
            existing = [
                item for item in candidates
                if item.concept_id == concept["id"] and item.provider == provider
            ]
            if len(existing) >= args.per_provider:
                continue
            needed = args.per_provider - len(existing)
            try:
                found = searchers[provider](concept, max(needed * 2, needed))
            except Exception as exc:  # provider errors are checkpointed, not fatal to other words
                failures.append({"concept_id": concept["id"], "provider": provider, "error": str(exc)})
                write_workspace_state(workspace, manifest, providers, concepts, candidates, failures)
                continue
            added = 0
            for candidate in found:
                if candidate.candidate_id in known_ids:
                    continue
                if args.no_download or download_asset(candidate, workspace):
                    candidates.append(candidate)
                    known_ids.add(candidate.candidate_id)
                    added += 1
                if added >= needed:
                    break
            write_workspace_state(workspace, manifest, providers, concepts, candidates, failures)
            if args.delay:
                time.sleep(args.delay)

    write_workspace_state(workspace, manifest, providers, concepts, candidates, failures)
    print(f"{len(candidates)} candidats enregistrés dans {workspace}")
    if failures:
        print(f"{len(failures)} recherches ont échoué; voir candidates.json", file=sys.stderr)
    return 0 if candidates else 2


def write_gallery(workspace: Path, concepts: list[dict], candidates: list[Candidate]) -> None:
    grouped: dict[str, list[Candidate]] = {}
    for candidate in candidates:
        grouped.setdefault(candidate.concept_id, []).append(candidate)
    concept_map = {item["id"]: item for item in concepts}
    recommendations = recommended_candidates(concepts, candidates)

    cards: list[str] = []
    for concept_id in sorted(grouped):
        concept = concept_map.get(
            concept_id,
            {"id": concept_id, "labels": {"fr": concept_id, "en": concept_id}},
        )
        label = (concept.get("labels") or {}).get("fr") or concept_id
        ranked = sorted(
            grouped[concept_id],
            key=lambda item: (
                candidate_score(item, concept),
                item.provider == "wikimedia",
                item.candidate_id,
            ),
            reverse=True,
        )
        suggested_id = recommendations.get(concept_id, ("", 0))[0]
        items: list[str] = []
        for candidate in ranked:
            image_src = html.escape(candidate.local_file or candidate.asset_url, quote=True)
            candidate_id = html.escape(candidate.candidate_id, quote=True)
            score = candidate_score(candidate, concept)
            suggested = candidate.candidate_id == suggested_id
            meta = " · ".join(
                part for part in [
                    candidate.provider,
                    candidate.source_name,
                    candidate.license,
                    candidate.creator,
                ] if part
            )
            badge = '<span class="suggestion">Suggestion automatique</span>' if suggested else ""
            needs_review = candidate_requires_review(candidate)
            review_badge = (
                '<span class="review-warning">À vérifier : licence / attribution</span>'
                if needs_review else ""
            )
            items.append(
                f"""<label class="candidate{' suggested' if suggested else ''}{' review-needed' if needs_review else ''}">
<input type="checkbox" value="{candidate_id}" data-suggested="{'1' if suggested else '0'}">
{badge}
{review_badge}
<img loading="lazy" src="{image_src}" alt="{html.escape(candidate.title or label)}">
<strong>{html.escape(candidate.title or label)}</strong>
<small>{html.escape(meta)}</small>
<small>score heuristique : {score}</small>
<a href="{html.escape(candidate.source_url, quote=True)}" target="_blank" rel="noopener">source</a>
</label>"""
            )
        cards.append(
            f"""<section><h2>{html.escape(label)} <code>{html.escape(concept_id)}</code></h2>
<div class="grid">{''.join(items)}</div></section>"""
        )

    document = f"""<!doctype html>
<html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Curation banque d’images LGC</title>
<style>
body{{font-family:system-ui,sans-serif;margin:24px;background:#f7f5fb;color:#241f32}} h1{{margin-bottom:4px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}}
.candidate{{position:relative;display:grid;gap:6px;background:white;border:1px solid #ddd5ee;border-radius:14px;padding:10px}}
.candidate.suggested{{border-color:#8f7ce8}} .candidate:has(input:checked){{outline:3px solid #6b57d9}}
.suggestion{{font-size:.72rem;font-weight:800;color:#5544ba;background:#eeeaff;border-radius:999px;padding:4px 8px;width:max-content}}
.review-warning{{font-size:.72rem;font-weight:800;color:#8a4c00;background:#fff0d6;border-radius:999px;padding:4px 8px;width:max-content}}
.candidate.review-needed{{border-style:dashed}}
img{{width:100%;height:150px;object-fit:contain;background:#fafafa}}
small{{color:#655e70}} code{{font-size:.7em;color:#6657aa}}
.toolbar{{position:sticky;top:0;background:#f7f5fb;padding:12px 0;z-index:2;display:flex;gap:8px;align-items:center;flex-wrap:wrap}}
button{{padding:10px 14px;font-weight:700}}
</style>
<h1>Banque d’images LGC — candidats</h1>
<p>La suggestion est un tri heuristique, pas une validation pédagogique ni juridique. Tu peux tout modifier avant export.</p>
<div class="toolbar">
<button id="suggest">Sélectionner les suggestions</button>
<button id="clear">Tout décocher</button>
<button id="export">Exporter la sélection</button>
<span id="count"></span>
</div>
{''.join(cards)}
<script>
const boxes=[...document.querySelectorAll('input[type=checkbox]')];
function refresh(){{document.querySelector('#count').textContent=boxes.filter(x=>x.checked).length+' image(s) sélectionnée(s)';}}
boxes.forEach(x=>x.addEventListener('change',refresh));refresh();
document.querySelector('#suggest').addEventListener('click',()=>{{
 boxes.forEach(x=>{{x.checked=x.dataset.suggested==='1';}});refresh();
}});
document.querySelector('#clear').addEventListener('click',()=>{{boxes.forEach(x=>{{x.checked=false;}});refresh();}});
document.querySelector('#export').addEventListener('click',()=>{{
 const selected=boxes.filter(x=>x.checked).map(x=>x.value);
 const blob=new Blob([JSON.stringify({{version:1,selected}},null,2)],{{type:'application/json'}});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='selection.json';a.click();
 setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}});
</script></html>"""
    (workspace / "gallery.html").write_text(document, encoding="utf-8")


def suggest_selection(args: argparse.Namespace) -> int:
    workspace = Path(args.workspace)
    data = json.loads((workspace / "candidates.json").read_text(encoding="utf-8"))
    concepts = data.get("concepts")
    if not isinstance(concepts, list):
        concepts = []
    candidates: list[Candidate] = []
    for raw in data.get("candidates") or []:
        try:
            candidates.append(Candidate(**raw))
        except TypeError:
            continue
    recommendations = recommended_candidates(concepts, candidates)
    selected = [
        candidate_id
        for candidate_id, _score in recommendations.values()
    ]
    output = Path(args.output) if args.output else workspace / "selection-suggested.json"
    output.write_text(
        json.dumps(
            {
                "version": 1,
                "selection_type": "heuristic-suggestion",
                "selected": selected,
                "scores": {
                    concept_id: {"candidate_id": candidate_id, "score": score}
                    for concept_id, (candidate_id, score) in recommendations.items()
                },
            },
            ensure_ascii=False,
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    print(f"{len(selected)} suggestion(s) écrite(s) dans {output}")
    return 0 if selected else 2


def apply_selection(args: argparse.Namespace) -> int:
    workspace = Path(args.workspace)
    data = json.loads((workspace / "candidates.json").read_text(encoding="utf-8"))
    selection = json.loads(Path(args.selection).read_text(encoding="utf-8"))
    selected_ids = set(selection.get("selected") or [])
    by_id = {item["candidate_id"]: item for item in data.get("candidates") or []}
    missing = sorted(selected_ids - set(by_id))
    if missing:
        raise ValueError("Sélection inconnue: " + ", ".join(missing))

    output = workspace / "selected"
    if output.exists() and args.clean:
        shutil.rmtree(output)
    output.mkdir(parents=True, exist_ok=True)
    selected: list[dict] = []
    for candidate_id in sorted(selected_ids):
        item = dict(by_id[candidate_id])
        local_file = item.get("local_file") or ""
        if not local_file:
            continue
        source = workspace / local_file
        if not source.exists():
            continue
        concept_dir = output / item["concept_id"]
        concept_dir.mkdir(parents=True, exist_ok=True)
        ext = source.suffix.lower() or ".jpg"
        name = f"{_slug(item['provider'])}-{hashlib.sha256(candidate_id.encode()).hexdigest()[:10]}{ext}"
        target = concept_dir / name
        shutil.copy2(source, target)
        item["selected_file"] = target.relative_to(output).as_posix()
        selected.append(item)

    manifest = {"version": 1, "selected": selected}
    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    issues = audit_selected(output)
    print(f"{len(selected)} image(s) copiée(s) dans {output}")
    if issues:
        print("\n".join(f"ATTENTION: {item}" for item in issues), file=sys.stderr)
        return 3
    return 0


def audit_selected(selected_dir: Path) -> list[str]:
    manifest_path = selected_dir / "manifest.json"
    if not manifest_path.exists():
        return ["manifest.json absent"]
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    issues: list[str] = []
    for item in payload.get("selected") or []:
        rel = item.get("selected_file") or ""
        if not rel or not (selected_dir / rel).exists():
            issues.append(f"{item.get('candidate_id')}: fichier absent")
        if not item.get("license"):
            issues.append(f"{item.get('candidate_id')}: licence absente")
        if not item.get("source_url"):
            issues.append(f"{item.get('candidate_id')}: URL source absente")
        if not item.get("creator") and _license_key(str(item.get("license"))) in {"by", "by-sa"}:
            issues.append(f"{item.get('candidate_id')}: auteur absent pour licence avec attribution")
        if item.get("review_required"):
            issues.append(f"{item.get('candidate_id')}: vérification de licence/source requise")
    return issues


def audit(args: argparse.Namespace) -> int:
    issues = audit_selected(Path(args.selected))
    if issues:
        print("\n".join(issues))
        return 3
    print("Audit OK")
    return 0


def package(args: argparse.Namespace) -> int:
    source = Path(args.source)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(source.parent))
    print(output)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Pipeline de curation d’images du Portail LGC")
    sub = parser.add_subparsers(dest="command", required=True)

    collect_p = sub.add_parser("collect", help="chercher et télécharger des candidats")
    collect_p.add_argument("--manifest", required=True)
    collect_p.add_argument("--output", required=True)
    collect_p.add_argument("--providers", default="wikimedia,openverse")
    collect_p.add_argument("--per-provider", type=int, default=4)
    collect_p.add_argument("--ids", default="", help="liste d’identifiants de concepts séparés par des virgules")
    collect_p.add_argument("--delay", type=float, default=0.15)
    collect_p.add_argument("--no-download", action="store_true")
    collect_p.add_argument(
        "--fresh",
        action="store_true",
        help="effacer le workspace avant collecte; par défaut une collecte reprend les checkpoints existants",
    )
    collect_p.set_defaults(func=collect)

    suggest_p = sub.add_parser(
        "suggest-selection",
        help="proposer automatiquement un candidat par concept pour accélérer la revue",
    )
    suggest_p.add_argument("--workspace", required=True)
    suggest_p.add_argument("--output", default="")
    suggest_p.set_defaults(func=suggest_selection)

    apply_p = sub.add_parser("apply-selection", help="copier/ranger les candidats cochés")
    apply_p.add_argument("--workspace", required=True)
    apply_p.add_argument("--selection", required=True)
    apply_p.add_argument("--clean", action="store_true")
    apply_p.set_defaults(func=apply_selection)

    audit_p = sub.add_parser("audit", help="vérifier fichiers et métadonnées du corpus sélectionné")
    audit_p.add_argument("--selected", required=True)
    audit_p.set_defaults(func=audit)

    zip_p = sub.add_parser("package", help="fabriquer un ZIP d’un workspace ou corpus sélectionné")
    zip_p.add_argument("--source", required=True)
    zip_p.add_argument("--output", required=True)
    zip_p.set_defaults(func=package)
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    try:
        return int(args.func(args))
    except (ValueError, OSError, urllib.error.URLError) as exc:
        parser.error(str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
