# ADA Français — positioning V2

## Goal

V2 extends the first positioning sequence without pretending that a handful of interactions produce a literacy level. Each probe answers a narrow classroom question and is reported separately.

The learner sequence is:

```text
identity → oral comprehension → own-name recognition → first letter name
→ visual discrimination → guided sound→letter → useful word → writing gesture → finish
```

The UI remains audio-first, adult and non-infantilising. Wrong answers use orange retry feedback; green is reserved for success. Teacher preview follows the exact same learner UI but records no activity.

## Probe boundaries

### Visual discrimination

The learner sees the model `BUS` and chooses the exact same visual form among close distractors. The spoken instruction explicitly says that reading is not required.

**Signal:** ability to visually discriminate the presented forms in this task.

**Do not infer:** word reading, decoding, vocabulary or comprehension.

### Guided sound → letter

The browser says: “maman… commence par le son mmm… touche la lettre M.” The target phoneme and target letter are therefore given in the instruction.

**Signal:** ability to follow an explicit guided sound/letter association.

**Do not infer:** autonomous phoneme isolation, grapheme recall or decoding. A genuinely independent phoneme↔grapheme probe remains a later pedagogical task.

### Useful word

The learner hears an instruction to find the written word **SORTIE** among several adult everyday/professional words.

**Signal:** recognition of this particular useful written word under a spoken prompt.

**Do not infer:** general word reading or decoding.

### Writing gesture

The learner traces over a large guide letter taken from the first letter of their first name. The canvas enables “J’ai essayé” only after a minimum amount of pointer movement.

The drawing itself is **not uploaded, scored or analysed**. Only completion metadata such as “attempted” and stroke count is stored.

**Signal:** the learner attempted the motor gesture on the device.

**Do not infer:** handwriting quality, letter formation mastery or fine-motor ability.

## Teacher preview

Authenticated teachers can open ADA Français → **Parcours**. The portal opens:

```text
/?preview=teacher&subject=ada-francais
```

Preview uses a fake learner (“Amina”) and sample roster only in browser memory. There is no signed join token, no learner localStorage identity and `trackEvent()` therefore performs no server write. A visible banner states that no learner response is recorded.

If the preview URL is opened while logged out, the normal teacher login is shown first and the same preview request continues after authentication.

## Reporting

Reports V1 keeps the probes separate:

- oral comprehension;
- own-name recognition;
- first letter name;
- visual discrimination;
- guided sound→letter;
- useful word recognition;
- writing gesture attempted;
- positioning completion.

The first-letter report explicitly says “lettre nommée, pas décodage”; guided sound→letter is marked as guided; writing is marked non-evaluated.

## Classroom validation still required

Before treating V2 as classroom-ready:

1. test speech synthesis on the actual Android/browser combinations;
2. verify that the emoji pictograms used in the oral task are unambiguous on those devices;
3. observe whether instructions are understandable without teacher rephrasing;
4. check touch drawing latency and canvas size on phones;
5. validate whether the same learner being selectable on two devices causes a real operational problem before adding a claim/locking mechanism.

These checks should refine the activities, not retroactively turn their narrow signals into a global level score.
