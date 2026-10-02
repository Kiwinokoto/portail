#!/usr/bin/env python3
"""Vendor the curated French Lingua Libre recordings used by Portail.

Downloads the original WAV files from Wikimedia Commons, verifies speaker/licence
metadata, writes stable ASCII filenames under assets/audio/fr/, and records a
machine-readable provenance manifest.

This is a development/release tool. Portail never calls Wikimedia at runtime
for the vendored words.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "assets" / "audio" / "fr"
MANIFEST = ROOT / "assets" / "audio" / "manifest.json"
USER_AGENT = "LGC-Portail-Audio-Vendor/1.0 (https://portail.lagrandeclasse.fr)"
ALLOWED_LICENSES = {"CC BY-SA 4.0", "CC0"}

SARTUS_WORDS = [
    ("arbre", "arbre"), ("assiette", "assiette"), ("banane", "banane"), ("bol", "bol"),
    ("bus", "bus"), ("bebe", "bébé"), ("casserole", "casserole"), ("chaise", "chaise"),
    ("chat", "chat"), ("chaussure", "chaussure"), ("chemise", "chemise"), ("chien", "chien"),
    ("cle", "clé"), ("couteau", "couteau"), ("cuillere", "cuillère"), ("douche", "douche"),
    ("eau", "eau"), ("enfant", "enfant"), ("fleur", "fleur"), ("four", "four"),
    ("fourchette", "fourchette"), ("frigo", "frigo"), ("lait", "lait"), ("lampe", "lampe"),
    ("lit", "lit"), ("livre", "livre"), ("magasin", "magasin"), ("main", "main"),
    ("maison", "maison"), ("manteau", "manteau"), ("montre", "montre"), ("moto", "moto"),
    ("nez", "nez"), ("pain", "pain"), ("pantalon", "pantalon"), ("parc", "parc"),
    ("pharmacie", "pharmacie"), ("pied", "pied"), ("pomme", "pomme"), ("porte", "porte"),
    ("poele", "poêle"), ("riz", "riz"), ("robinet", "robinet"), ("rue", "rue"),
    ("sac", "sac"), ("savon", "savon"), ("serviette", "serviette"), ("stylo", "stylo"),
    ("table", "table"), ("tasse", "tasse"), ("tomate", "tomate"), ("train", "train"),
    ("telephone", "téléphone"), ("verre", "verre"), ("voiture", "voiture"), ("velo", "vélo"),
    ("ecole", "école"), ("oeil", "œil"), ("oeuf", "œuf"),
]

SOURCES = [
    {
        "id": slug,
        "word": word,
        "speaker": "Sartus85",
        "file": f"LL-Q150 (fra)-Sartus85-{word}.wav",
    }
    for slug, word in SARTUS_WORDS
] + [
    {
        "id": "brosse-a-dents",
        "word": "brosse à dents",
        "speaker": "Pamputt",
        "file": "LL-Q150 (fra)-Pamputt-brosse à dents.wav",
    },
    {
        "id": "toilettes",
        "word": "toilettes",
        "speaker": "Justforoc",
        "file": "LL-Q150 (fra)-Justforoc-toilettes.wav",
    },
]


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.load(response)


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def plain(value: str) -> str:
    return re.sub(r"<[^>]+>", "", value or "").strip()


def commons_metadata(files: list[str]) -> dict[str, dict]:
    result: dict[str, dict] = {}
    for start in range(0, len(files), 20):
        batch = files[start : start + 20]
        query = {
            "action": "query",
            "prop": "imageinfo",
            "iiprop": "url|extmetadata|size",
            "format": "json",
            "formatversion": "2",
            "titles": "|".join(f"File:{name}" for name in batch),
        }
        data = fetch_json(
            "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(query)
        )
        for page in data["query"]["pages"]:
            title = page.get("title", "")
            filename = title[5:] if title.startswith("File:") else title
            info = (page.get("imageinfo") or [{}])[0]
            metadata = info.get("extmetadata") or {}
            result[filename] = {
                "download_url": info.get("url", ""),
                "description_url": info.get("descriptionurl", ""),
                "source_bytes": info.get("size"),
                "license": plain((metadata.get("LicenseShortName") or {}).get("value", "")),
                "artist": plain((metadata.get("Artist") or {}).get("value", "")),
            }
    return result


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    metadata = commons_metadata([item["file"] for item in SOURCES])
    manifest_items = []
    total_bytes = 0

    for source in SOURCES:
        meta = metadata.get(source["file"])
        if not meta or not meta["download_url"]:
            raise SystemExit(f"Commons file missing: {source['file']}")
        if meta["license"] not in ALLOWED_LICENSES:
            raise SystemExit(
                f"Unexpected licence for {source['file']}: {meta['license']!r}"
            )
        if source["speaker"].casefold() not in meta["artist"].casefold():
            raise SystemExit(
                f"Speaker metadata mismatch for {source['file']}: {meta['artist']!r}"
            )

        payload = fetch_bytes(meta["download_url"])
        if not payload.startswith(b"RIFF") or b"WAVE" not in payload[:16]:
            raise SystemExit(f"Downloaded file is not WAV: {source['file']}")
        target = DEST / f"{source['id']}.wav"
        target.write_bytes(payload)
        digest = hashlib.sha256(payload).hexdigest()
        total_bytes += len(payload)

        manifest_items.append(
            {
                "id": source["id"],
                "word": source["word"],
                "speaker": source["speaker"],
                "license": meta["license"],
                "artist": meta["artist"],
                "source_file": source["file"],
                "source_page": meta["description_url"],
                "sha256": digest,
                "bytes": len(payload),
                "asset": f"/assets/audio/fr/{source['id']}.wav",
            }
        )

    if len(manifest_items) != 61:
        raise SystemExit(f"Expected 61 recordings, got {len(manifest_items)}")
    if total_bytes > 10 * 1024 * 1024:
        raise SystemExit(f"Unexpected audio size: {total_bytes} bytes")

    MANIFEST.write_text(
        json.dumps(
            {
                "version": 1,
                "generated_from": "Wikimedia Commons / Lingua Libre",
                "runtime_dependency": False,
                "count": len(manifest_items),
                "total_bytes": total_bytes,
                "items": manifest_items,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        f"Vendored {len(manifest_items)} WAV files "
        f"({total_bytes / 1024 / 1024:.2f} MiB) into {DEST}"
    )


if __name__ == "__main__":
    main()
