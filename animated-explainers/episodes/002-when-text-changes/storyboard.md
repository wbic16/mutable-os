# When Text Changes

*Position Is Not Identity*  
Mutable Concepts · Volume I — Foundations · Concept 002  
60 seconds · 1080 × 1080 · 30 fps · silent

Two annotations begin on the same **f** in “The fox jumps.” The purple annotation ends on **x**. The gold annotation continues to **s**. Watching both through the same insertion makes the difference between a recorded offset and a character reference visible.

| Time | Picture and action | Reading |
| --- | --- | --- |
| 0–5 s | The sentence appears under the title. Separate purple and gold underlines grow visible beneath the two readings. | What happens to an annotation when its text changes? |
| 5–12 s | The sentence opens onto a zero-based ruler. Spaces become middle dots. Dashed leaders point up to the ruler. Two records show the stored boundaries and quote their readings. | A spans 4–6, “fox”. B spans 4–12, “fox jumps”. Both ends are inclusive. |
| 12–19 s | “red ” enters before “fox”. The suffix slides right. The leaders stay at their numbered positions and both records turn coral. | The unchanged offsets now read “red” and “red fox j”. |
| 19–24 s | The records and surrounding letters fade. The surviving **f** moves into focus above its original and current indices, 4 → 8. | Position ≠ Identity. |
| 24–32 s | Reset to the original sentence. A folded-corner outline forms around each character, with a smaller index inside. Two solid lines meet distinct ports on the very same **f** Cell. | Both records reference the same starting Cell. Their ending Cells differ. |
| 32–41 s | Repeat the “red ” insertion. Four new Cells enter, while the existing Cells, boundary pins and annotation bars move together. A dash marks each new Cell’s pending index. | The records still read “fox” and “fox jumps”. The surviving Cells still display their old indices. |
| 41–47 s | A mint pointer sweeps from the insertion to the full stop. Each index changes as the pointer reaches it. Each record reads its two boundary Cells, so both starts change together as the pointer passes **f**. | A now spans 8–10 and B spans 8–16. Update the Cells, not every property. |
| 47–54 s | A mint **x** enters before the original **x**. Labels distinguish the two. The purple endpoint stays on the original, both bars expand and a second sweep updates the suffix. | A covers “foxx” at 8–11. B covers “foxx jumps” at 8–17. |
| 54–60 s | Fade the indices and records, keeping the final Cells and their connectors. Three concluding lines appear in sequence, followed by “Standoff Properties + Mutable Text” on the engraved series end card. | Characters have identities. Positions can change. Annotations follow their referenced characters. |

## How to read the drawing

A character Cell has an identity for its lifetime in the sequence. Its letter and current index are separate pieces of information. In the numerical demonstration, dashed connectors reach above the characters to the numbered ruler. In the Cell demonstration, solid connectors land on the lower edges of the containers. The smaller grey numbers inside can change while those connections hold.

The numerical demonstration deliberately leaves its stored offsets unchanged. A system that maps offsets through an edit could repair them. The two Cell demonstrations use insertions with surviving boundary Cells. Deleting a referenced boundary requires an editing rule of its own.

## Frame model

The two properties hold direct references to the original **f**, **x** and **s** objects. Each edited sequence retains the surviving objects and inserts fresh ones. The drawing looks up each endpoint in the same layout used to place its Cell. The quotes come from inclusive slices of the current sequence.

The reindexing sweep assigns indices in sequence order from the insertion onward. Its intermediate tables are prepared in advance, keyed by Cell object. Seeking to any frame selects the corresponding table for both the Cell labels and the property readouts. This lets the silent Studio preview and the exported film show the same intermediate state when scrubbed in either direction.
