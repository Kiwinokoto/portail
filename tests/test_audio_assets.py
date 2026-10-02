import hashlib
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
AUDIO_DIR = ROOT / "assets" / "audio" / "fr"
MANIFEST = ROOT / "assets" / "audio" / "manifest.json"


class VendoredFrenchAudioTests(unittest.TestCase):
    def test_manifest_matches_vendored_audio(self):
        payload = json.loads(MANIFEST.read_text(encoding="utf-8"))
        items = payload["items"]
        self.assertEqual(payload["count"], 61)
        self.assertEqual(len(items), 61)
        self.assertFalse(payload["runtime_dependency"])

        files = sorted(AUDIO_DIR.glob("*.wav"))
        self.assertEqual(len(files), 61)
        self.assertEqual(
            {path.name for path in files},
            {Path(item["asset"]).name for item in items},
        )

        total = 0
        for item in items:
            path = ROOT / item["asset"].lstrip("/")
            body = path.read_bytes()
            self.assertTrue(body.startswith(b"RIFF"))
            self.assertIn(b"WAVE", body[:16])
            self.assertEqual(len(body), item["bytes"])
            self.assertEqual(hashlib.sha256(body).hexdigest(), item["sha256"])
            self.assertIn(item["license"], {"CC BY-SA 4.0", "CC0"})
            total += len(body)

        self.assertEqual(total, payload["total_bytes"])

    def test_voice_selection_is_documented(self):
        payload = json.loads(MANIFEST.read_text(encoding="utf-8"))
        speakers = {item["id"]: item["speaker"] for item in payload["items"]}
        self.assertEqual(sum(value == "Sartus85" for value in speakers.values()), 59)
        self.assertEqual(speakers["brosse-a-dents"], "Pamputt")
        self.assertEqual(speakers["toilettes"], "Justforoc")


if __name__ == "__main__":
    unittest.main()
