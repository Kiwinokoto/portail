# ADA foundational practice — learning cards and Memory

## Purpose

Add a lightweight **practice** layer for learners who need repeated exposure to letters, syllables and useful written words.

This is deliberately separate from ADA positioning. A learner may repeat an activity many times, make mistakes, use audio help and preview/reveal cards without those interactions being treated as proof of a literacy level.

The visual reference is the simplicity of learning / nomenclature cards: one clear object or written form, one stable word, large typography, little interface noise. This is an inspiration for presentation, not a claim that Portail implements a complete Montessori method.

## Vocabulary model

ADA should not artificially split basic vocabulary by vocational pathway.

The default pool can combine words encountered in PSR, AEPE and other training contexts **when they are also ordinary, useful words of daily life**. Examples include transport, food, kitchen objects, hygiene, home, people, places and common signs.

Each item should carry tags so a later activity can filter or weight a subset without duplicating the word:

```json
{
  "id": "verre",
  "word": "VERRE",
  "spoken": "verre",
  "image": "assets/learning/verre.svg",
  "tags": ["everyday", "psr", "kitchen"],
  "difficulty": 1
}
```

Vocational tags are metadata. For ADA, a broadly useful word can appear regardless of whether it originally came from PSR, AEPE or another pathway.

## V1 activity families

### 1. Visual case matching

Examples: `A ↔ a`, `M ↔ m`.

Use this as visual familiarity practice only. Do not label success as reading or decoding.

### 2. Listen → written form

The learner hears a letter name, a clearly modelled sound, or a syllable and selects the corresponding written form.

The exact pedagogical meaning depends on the prompt. A guided “mmm → M” activity remains guided association; a later independent probe would be a different activity and requires separate validation.

### 3. Image ↔ useful word

Present one clear image and a short everyday word, then reuse the same pair in recognition/matching exercises.

Keep images unambiguous on small phones and avoid decorative detail that competes with the target object.

### 4. Small Memory game

Reuse pairs from the same content dataset. Fragile learners should start with about 3–4 pairs; larger sets are progression, not the default.

Possible pair types:

- uppercase ↔ lowercase;
- image ↔ word;
- heard token ↔ written token;
- identical useful words for pure visual reinforcement when appropriate.

Preview/reveal is allowed because this is practice, not assessment.

## Audio and accessibility

- Audio-first instructions with visible text fallback.
- Reuse browser TTS where reliable; allow recorded audio per item later without changing the activity model.
- Large touch targets, one main instruction at a time, no horizontal scrolling.
- Green remains success; orange remains retry/attention. Do not use semantic colors decoratively.
- The tone and imagery must remain adult/non-infantilising even when the reading level is very low.

## Reuse of La-Grande-Classe-R-D/memory

The existing `memory` prototype is useful as a reference/parts donor:

- small generic matching engine;
- random sampling of pairs;
- reveal/new-game controls;
- TTS with optional audio-file fallback;
- responsive card grid;
- service-worker/offline foundation.

Do **not** copy it wholesale. Known debt includes incomplete datasets, empty image-word levels and no meaningful test suite. Portail should own the final content model, learner/session integration and semantic UI rules.

The preferred direction is to extract/reimplement the small generic mechanics around a Portail-owned dataset rather than introduce a second standalone learner identity/session system.

## Tracking boundary

V1 practice can exist without changing positioning reports.

Before persisting practice history, decide which problem it solves:

1. resume/repetition convenience;
2. teacher visibility of simple completion;
3. adaptive repetition.

Raw attempts and retries must not silently enter ADA positioning reports or become a global score.

## First implementation slice

A small, reversible first slice should:

1. add a Portail-owned vocabulary dataset with a handful of common items;
2. expose a teacher preview for practice without learner writes;
3. implement one image↔word/card flow plus a 3–4 pair Memory mode using the same dataset;
4. use existing Portail TTS/helpers and semantic styles;
5. add targeted JS/static checks before any learner-session tracking is introduced.

Field observation on actual target phones should decide the next expansion.
