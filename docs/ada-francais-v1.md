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

1. teacher creates the class session and preloads the learner roster;
2. learner opens the signed class-session link / QR;
3. learner selects their prepared identity instead of typing their name;
4. browser speech synthesis says the learner's first name;
5. learner recognises the written form of their own first name among adult first-name distractors;
6. learner matches the first **letter name** of their first name;
7. attempts and completions are visible to the teacher through 4-second polling.

The second task is only a letter-name recognition probe. It must **not** be interpreted as evidence that the learner has mastered the initial phoneme or grapheme↔phoneme correspondence.

## Audio

V1 uses the browser Web Speech / `speechSynthesis` API with `fr-FR` rather than shipping audio assets. Text remains visible as a fallback. Before classroom use, test the actual target browser/device voices and volume; voice availability is platform-dependent.

## Learner identity / roster

The teacher prepares the roster from **Élèves / suivi**. Input accepts one learner per line:

```text
Amina; Diallo
Moussa; Traoré
Sofia
```

A tab separator is also accepted for spreadsheet copy/paste.

The signed learner link exposes only the opaque learner id, first name and optional last-name initial for the session roster. Full last names stay server-side and are visible in the authenticated teacher view. The learner therefore never needs to type their own name.

The browser stores only the opaque learner id in `localStorage` to resume the same learner after refresh. Server-side activity remains scoped to the signed class-session link.

No database migration is needed for this pass: the roster reuses the existing `learners` table and whether someone has actually started is derived from `activity_events`.

### Known roster limitations

- roster entries are append-only in the current UI; typo/edit/remove should be added before broader rollout;
- exact duplicate `Prénom + Nom` rows are ignored, so identical full names need a distinguishing second given name or other teacher-entered discriminator for now;
- the same prepared learner can still be selected on more than one device; events would then aggregate under that learner. Add a claim/device safeguard only if classroom testing shows it is needed.

## Event model

Allowed public learner events are intentionally narrow:
- `activity_started`
- `audio_played`
- `answer`
- `activity_completed`

The server validates that the learner belongs to the signed class session and caps event payloads at 4 KiB. The teacher summary exposes counts useful for live support, not a durable gradebook.

## Privacy boundary

The class join URL is a bearer link. Anyone holding it can see the first names and last-name initials prepared for that class session. Do not put unnecessary personal information in the roster. This is intentionally narrower than exposing full names and should eventually be replaced by Moodle identity/group integration.

## Next useful probes

Add small independent activities for:
- oral instruction comprehension without text;
- same/different visual word discrimination;
- sound ↔ grapheme matching;
- recognition of a few high-value everyday/professional words;
- copying / assembling a useful written word before free writing.

Keep each probe short, replayable and immediately understandable through audio/visual cues.
