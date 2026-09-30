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
4. learner completes a short oral-comprehension probe first: spoken everyday nouns → visual choices, with no reading required;
5. browser speech synthesis says the learner's first name;
6. learner recognises the written form of their own first name among adult first-name distractors;
7. learner matches the first **letter name** of their first name;
8. attempts and completions are visible to the teacher through 4-second polling.

The second task is only a letter-name recognition probe. It must **not** be interpreted as evidence that the learner has mastered the initial phoneme or grapheme↔phoneme correspondence. The oral probe is deliberately independent from reading: the target instruction is spoken and the learner answers through pictorial choices.

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

### Roster behaviour after the teacher-controls pass

- the teacher can correct first/last names from the live view;
- a learner can be removed only before any activity exists; once work is recorded, removal is refused so activity is not silently destroyed;
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

## Oral-comprehension probe

The first oral probe contains three short rounds using common concrete nouns (phone, key, bus) and pictorial choices. Each round can be replayed. Wrong choices produce a neutral retry cue; the learner is not blocked by a first mistake. The whole probe records as one completed activity while individual attempts remain available in the lightweight event stream.

The current visuals use platform emoji as temporary dependency-free pictograms. Before classroom rollout, validate them on the actual learner devices; glyph appearance varies by OS/browser, and ambiguous icons should be replaced with controlled local SVG/image assets.

This probe only gives a narrow signal about comprehension of those spoken nouns and the action instruction. It must not be treated as a general oral-French level.

## Next useful probes

Add small independent activities for:
- same/different visual word discrimination;
- sound ↔ grapheme matching;
- recognition of a few high-value everyday/professional words;
- copying / assembling a useful written word before free writing.

Keep each probe short, replayable and immediately understandable through audio/visual cues.


## V2 continuation

The V1 event and identity model is retained for compatibility. The next learner sequence is documented in [`ada-francais-v2.md`](ada-francais-v2.md). The overall completion event keeps the historical `positioning-v1` item id so existing reports remain compatible; the individual new probes have their own item ids and must be interpreted independently.
