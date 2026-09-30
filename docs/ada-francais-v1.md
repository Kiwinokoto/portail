# ADA Français — positioning V1

## Audience and teaching constraint

The first ADA learners may be young adults with little or no prior schooling. The interface must therefore not assume fluent reading, while staying adult, calm and non-infantilising.

The initial progression remains:

```text
oral → written word → alphabetic principle → sounds / letters → useful words → reading / writing
```

Skills should be treated independently. A learner may understand spoken French while not reading, recognise a familiar word while not decoding, or know some letters without being able to blend sounds.

## V1 activity

The first vertical is deliberately small:

1. learner opens the signed class-session link / QR;
2. learner identity is attached to the class session;
3. browser speech synthesis says the learner's first name;
4. learner recognises the written form of their own first name among adult first-name distractors;
5. learner matches the first **letter name** of their first name;
6. attempts and completions are visible to the teacher through 4-second polling.

The second task is only a letter-name recognition probe. It must **not** be interpreted as evidence that the learner has mastered the initial phoneme or grapheme↔phoneme correspondence.

## Audio

V1 uses the browser Web Speech / `speechSynthesis` API with `fr-FR` rather than shipping audio assets. Text remains visible as a fallback. Before classroom use, test the actual target browser/device voices and volume; voice availability is platform-dependent.

## Learner identity limitation

The current first visit asks for the learner's first name to be typed once. This is intentionally temporary and the UI tells the learner that the teacher can help.

Proper fix: teacher-side roster/preload or a visual/name-selection handoff so the learner can enter the activity without typing or reading an instruction first. Avoid speech-recognition as the only path because browser support, accents, noise and privacy make it unreliable for this audience.

The browser stores only the opaque learner id in `localStorage` to resume the same learner after refresh; the first name remains server-side. Server-side activity remains scoped to the signed class-session link.

## Event model

Allowed public learner events are intentionally narrow:
- `activity_started`
- `audio_played`
- `answer`
- `activity_completed`

The server validates that the learner belongs to the signed class session and caps event payloads at 4 KiB. The teacher summary exposes counts useful for live support, not a durable gradebook.

## Next useful probes

Add small independent activities for:
- oral instruction comprehension without text;
- same/different visual word discrimination;
- sound ↔ grapheme matching;
- recognition of a few high-value everyday/professional words;
- copying / assembling a useful written word before free writing.

Keep each probe short, replayable and immediately understandable through audio/visual cues.
