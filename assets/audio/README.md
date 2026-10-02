# French vocabulary audio sources

Portail prefers curated human recordings for isolated French vocabulary before falling back to browser speech synthesis.

The current 61-word bank is **vendored locally** under `assets/audio/fr/`; learner playback does not depend on Wikimedia or another external service at runtime. The original WAV files are kept unchanged because the full bank is only about 4.5 MiB.

- Main speaker: **Sartus85**, recordings produced with Lingua Libre and hosted on Wikimedia Commons.
- Main licence: **CC BY-SA 4.0**.
- Fallback for `brosse à dents`: **Pamputt**, Lingua Libre, **CC0**.
- Fallback for `toilettes`: **Justforoc**, Lingua Libre, **CC BY-SA 4.0**.
- `manifest.json` records the exact original Commons file, speaker/artist metadata, licence, source page, SHA-256 and local asset path for every recording.
- `tools/vendor_french_audio.py` can reproduce the bank from Commons and refuses unexpected licences or speaker metadata.
- Browser speech synthesis remains a fallback only for dynamic text or phrases for which no curated human recording exists.

The temporary admin comparison UI used to choose this direction was removed after field testing on 2 October 2026.
