from __future__ import annotations

import json
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path

from tools import image_bank


class ImageBankTests(unittest.TestCase):
    def test_license_normalization(self):
        self.assertEqual("cc0", image_bank._license_key("CC0 1.0"))
        self.assertEqual("pdm", image_bank._license_key("Public domain"))
        self.assertEqual("by", image_bank._license_key("CC BY 4.0"))
        self.assertEqual("by-sa", image_bank._license_key("CC BY-SA 4.0"))

    def test_openverse_normalization_keeps_provenance(self):
        candidate = image_bank.normalize_openverse(
            {
                "id": "abc",
                "title": "Red apple",
                "creator": "Alice",
                "source": "flickr",
                "thumbnail": "https://example.test/apple.jpg",
                "foreign_landing_url": "https://example.test/source",
                "license": "by",
                "license_version": "2.0",
                "license_url": "https://creativecommons.org/licenses/by/2.0/",
                "width": 1200,
                "height": 800,
            },
            "pomme",
            "apple fruit",
        )
        self.assertIsNotNone(candidate)
        self.assertEqual("openverse:abc", candidate.candidate_id)
        self.assertEqual("BY 2.0", candidate.license)
        self.assertEqual("aggregated-metadata", candidate.license_confidence)
        self.assertTrue(candidate.review_required)

    def test_wikimedia_normalization_can_be_source_verified(self):
        candidate = image_bank.normalize_wikimedia(
            {
                "pageid": 42,
                "title": "File:Apple.jpg",
                "imageinfo": [{
                    "thumburl": "https://upload.wikimedia.org/apple.jpg",
                    "descriptionurl": "https://commons.wikimedia.org/wiki/File:Apple.jpg",
                    "thumbwidth": 480,
                    "thumbheight": 320,
                    "extmetadata": {
                        "LicenseShortName": {"value": "CC BY-SA 4.0"},
                        "LicenseUrl": {"value": "https://creativecommons.org/licenses/by-sa/4.0/"},
                        "Artist": {"value": "<b>Alice</b> Example"},
                    },
                }],
            },
            "pomme",
            "apple",
        )
        self.assertIsNotNone(candidate)
        self.assertEqual("Alice Example", candidate.creator)
        self.assertEqual("source-metadata", candidate.license_confidence)
        self.assertFalse(candidate.review_required)

    def test_gallery_and_selection_pipeline(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            local = root / "candidates" / "pomme" / "wikimedia" / "apple.jpg"
            local.parent.mkdir(parents=True)
            local.write_bytes(b"fake-jpeg")
            candidate = image_bank.Candidate(
                candidate_id="wikimedia:42",
                concept_id="pomme",
                provider="wikimedia",
                provider_id="42",
                query="apple",
                title="Apple",
                creator="Alice",
                source_name="Wikimedia Commons",
                source_url="https://commons.wikimedia.org/wiki/File:Apple.jpg",
                asset_url="https://upload.wikimedia.org/apple.jpg",
                license="CC BY 4.0",
                license_url="https://creativecommons.org/licenses/by/4.0/",
                local_file="candidates/pomme/wikimedia/apple.jpg",
                license_confidence="source-metadata",
                review_required=False,
            )
            concepts = [{"id": "pomme", "labels": {"fr": "pomme", "en": "apple"}}]
            image_bank.write_gallery(root, concepts, [candidate])
            gallery = (root / "gallery.html").read_text(encoding="utf-8")
            self.assertIn("wikimedia:42", gallery)
            self.assertIn("selection.json", gallery)

            (root / "candidates.json").write_text(
                json.dumps({"version": 1, "candidates": [image_bank.asdict(candidate)]}),
                encoding="utf-8",
            )
            selection = root / "selection.json"
            selection.write_text(
                json.dumps({"version": 1, "selected": ["wikimedia:42"]}),
                encoding="utf-8",
            )
            status = image_bank.apply_selection(
                Namespace(workspace=str(root), selection=str(selection), clean=True)
            )
            self.assertEqual(0, status)
            manifest = json.loads((root / "selected" / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(1, len(manifest["selected"]))
            self.assertEqual([], image_bank.audit_selected(root / "selected"))

    def test_wikimedia_title_relevance_filters_obvious_homonyms(self):
        pomme = {
            "id": "pomme",
            "labels": {"fr": "pomme", "en": "apple"},
            "queries": ["red apple fruit", "apple"],
        }
        tasse = {
            "id": "tasse",
            "labels": {"fr": "tasse", "en": "mug"},
            "queries": ["coffee mug", "mug"],
        }
        self.assertFalse(image_bank.title_relevant("Tomato je.jpg", pomme))
        self.assertTrue(image_bank.title_relevant("Red Apple.jpg", pomme))
        self.assertTrue(image_bank.title_relevant("Wikipedia mug.jpg", tasse))
        self.assertFalse(image_bank.title_relevant("StanleyCup.jpg", tasse))

    def test_collect_resumes_completed_provider_without_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = root / "concepts.json"
            manifest.write_text(
                json.dumps({
                    "concepts": [{
                        "id": "pomme",
                        "labels": {"fr": "pomme", "en": "apple"},
                        "queries": ["red apple fruit", "apple"],
                    }]
                }),
                encoding="utf-8",
            )
            existing = image_bank.Candidate(
                candidate_id="openverse:existing",
                concept_id="pomme",
                provider="openverse",
                provider_id="existing",
                query="red apple fruit",
                title="Apple",
                creator="Alice",
                source_name="flickr",
                source_url="https://example.test/source",
                asset_url="https://example.test/apple.jpg",
                license="CC0 1.0",
                license_url="https://creativecommons.org/publicdomain/zero/1.0/",
            )
            (root / "candidates.json").write_text(
                json.dumps({
                    "version": 1,
                    "candidates": [image_bank.asdict(existing)],
                    "failures": [],
                }),
                encoding="utf-8",
            )
            called = []
            original = image_bank.search_openverse
            image_bank.search_openverse = lambda *_args, **_kwargs: called.append(True) or []
            try:
                status = image_bank.collect(Namespace(
                    manifest=str(manifest),
                    output=str(root),
                    providers="openverse",
                    per_provider=1,
                    ids="",
                    delay=0,
                    no_download=True,
                    fresh=False,
                ))
            finally:
                image_bank.search_openverse = original
            self.assertEqual(0, status)
            self.assertEqual([], called)
            self.assertTrue((root / "gallery.html").exists())

    def test_concept_queries_keep_language_fallbacks(self):
        queries = image_bank.concept_queries({
            "id": "pomme",
            "labels": {"fr": "pomme", "en": "apple"},
            "queries": ["red apple fruit", "apple"],
        })
        self.assertEqual("red apple fruit", queries[0])
        self.assertIn("apple", queries)
        self.assertIn("pomme", queries)

    def test_load_concepts_rejects_duplicate_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "manifest.json"
            path.write_text(
                json.dumps({
                    "concepts": [
                        {"id": "pomme", "labels": {"fr": "pomme"}},
                        {"id": "pomme", "labels": {"fr": "pomme"}},
                    ]
                }),
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                image_bank.load_concepts(path)


if __name__ == "__main__":
    unittest.main()
