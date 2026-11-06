# Phext support

Mutable can open and export **phext** files (`.phext`) from the Workspace
menu's Local files group: **Open Phext…** and **Export Phext…**, behind the
`phextDocuments` feature flag (enabled by default). Both are explicit,
manual file actions — there is no autosave, no background conversion, and
nothing phext-related runs while typing.

## The format, from the sources

A phext is plain text with structure: nine ASCII control bytes act as
dimension breaks. Each break closes the current **scroll** and advances the
coordinate — it increments its own dimension and resets every lower
dimension to 1. Coordinates are 9D, grouped in three arms, written
`library.shelf.series/collection.volume.book/chapter.section.scroll`, and
**1-based**: no component may be less than 1. The first scroll of a phext
sits at `1.1.1/1.1.1/1.1.1`. Line breaks (0x0A) are ordinary scroll content.

| Break byte | Dimension |
| --- | --- |
| 0x01 | library |
| 0x1F | shelf |
| 0x1E | series |
| 0x1D | collection |
| 0x1C | volume |
| 0x1A | book |
| 0x19 | chapter |
| 0x18 | section |
| 0x17 | scroll |

(0x1B is not a break.) Derived from libphext's `phext.rs` (break constants,
`to_coordinate`, the per-dimension `*_break` methods) and cross-checked
against the reference dead-reckoning parser `parse_phext.py`; the two
agree on every byte and on the coordinate order. Because the breaks are
ASCII control bytes — themselves valid UTF-8 — and scroll content is text,
a conforming phext is valid UTF-8 as a whole byte stream. A coordinate
only addresses a scroll **within its own phext file**; the same coordinate
in another phext is a different scroll.

## How a phext maps to a Document

- One phext ↔ one Document (`document-block`). The Document's metadata
  carries `phext: { version: 1, sourceFilename }`.
- One scroll ↔ one TextBlock (`plain-text-block`) whose
  `metadata.phextCoordinate` carries the coordinate string.
- Interior empty scrolls are preserved as empty TextBlocks — they are real
  addressed slots. A final break at end of file does not create a scroll
  (the reference parsers agree), and empty input opens as one empty scroll
  at the origin.
- The codec round-trips byte for byte: `Export Phext…` on an unedited
  imported phext reproduces the file, including coordinate gaps, because
  serialization emits the minimal break sequence between coordinates.
- Exporting a Document that did not come from a phext projects its text:
  Blocks with string `text` are collected depth-first in authored order;
  Blocks carrying a phext coordinate keep it, the rest are assigned
  successive scroll coordinates. Non-text Blocks have no phext
  representation and are omitted. Export never marks the Document saved —
  the Document's own format is Mutable JSON, and phext is a text
  projection of it.

Implementation: `src/phext/` (new files only). Codec and mapping tests sit
alongside the code (`src/phext/*.test.ts`); the upstream files touched are
enumerated in PATCHES.md.
