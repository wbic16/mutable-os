# Finding things through words

*Entity discovery through textual mentions*  
Mutable OS / Concepts / 007 · Volume II — From Text to Knowledge

Follow a single description through two searches. Both use case-insensitive equality. One examines stored entity properties, the other the complete text of each annotated occurrence. Keep an eye on Mention 04 on the return trip.

## Illustrative corpus

The six passages were written for the animation. James Bond’s stored name is “James Bond” and his designation is “007”. Felix Leiter’s stored name is “Felix Leiter”. Every link below is given before the searches begin.

| Document | Source passage | Mention records |
| --- | --- | --- |
| 01 | Bond entered the casino. | 01 · Bond → James Bond |
| 02 | 007 received his instructions. | 02 · 007 → James Bond |
| 03 | The British agent ordered a drink. | 03 · The British agent → James Bond |
| 04 | The man in the dinner jacket approached the table. | 04 · The man in the dinner jacket → James Bond |
| 05 | Bond opened the envelope. He examined the dossier. | 05 · Bond → James Bond; 06 · He → James Bond |
| 06 | Felix Leiter entered the room. He took a seat. | 07 · Felix Leiter → Felix Leiter; 08 · He → Felix Leiter |

## Picture, captions and speech

Times are absolute seconds. The [editable cue manifest](scenes.json) gives entrances relative to each scene.

| Scene | Picture | Caption or title | Voice |
| --- | --- | --- | --- |
| 0–7 | Introduce “Bond.” and then “James Bond.” against a faint 007. Give the episode title the engraved series card. | Finding things through words | 0.45 · Bond. James Bond.<br>3.00 · Finding an entity is easy when you know its name. |
| 7–14 | Enter “James Bond”. Trace the query to the property panel, emphasise the canonical name and follow the connection to the entity. | Search by name. | 7.30 · A search of entity names can take us directly to the entity we seek. |
| 14–24 | Keep the field in place and change its value to “The man in the dinner jacket”. Inspect the canonical name and designation in turn. Hold on “No matching name” with Bond still visible. | But what if the text calls him something else?<br>The entity exists. The name does not match. | 14.10 · But what if the text calls him something else?<br>17.60 · The man in the dinner jacket.<br>20.05 · A search of names and aliases may find nothing. |
| 24–34 | Reframe Bond and introduce the first four documents. Every teal range already has its own numbered record and an amber connection to Bond. | Many expressions. One entity. | 24.20 · Yet across a corpus, an entity may be referred to in many different ways.<br>28.95 · Each annotated mention connects a particular textual occurrence to its referent. |
| 34–47 | Repeat the dinner-jacket query in the same field. Scan the four passages. Enlarge Document 04 and light the exact description. Follow the pulse through Mention 04 to Bond. | Search by mention.<br>Same search. Different path. | 34.25 · Instead of searching the names of entities, we can search the language used to refer to them.<br>41.10 · Follow a matching mention, and we arrive at the entity itself. |
| 47–62 | Query “Bond” and gather Mentions 01 and 05 under one person. Introduce both pronoun contexts and their existing links. Query “He” and follow the two matches to James Bond and Felix Leiter. | Two matching mentions. One entity.<br>Same expression. Different entities. | 47.25 · Two mentions of Bond lead to one person.<br>52.50 · The same expression may even lead to different entities. The recorded associations, rather than the words alone, determine the results. |
| 62–72 | Recall the dinner-jacket result. Start the light at Bond, pass through Mention 04 and arrive on precisely the words in Document 04 that produced the match. | Discovery with textual provenance. | 63.10 · And every result retains a connection to the passage from which it was discovered. |
| 72–80 | Hold the engraved end card and website attribution after the final line. | The language of a corpus becomes an index into its knowledge graph. | 72.80 · The language of a corpus becomes an index into its knowledge graph. |
