# Mutable OS — Textual Workspace Visual Refinement

## Context

Textual Workspace Increments 1–4 have been implemented and qualified.

The first integrated screenshot of Flint, marginalia and Gloss Explorer demonstrates that the cell-based Textual presentation is functioning. The overall result is promising and broadly consistent with our original 1990s Borland/Turbo Pascal IDE design direction.

However, the interface would benefit from a focused visual and usability refinement.

**This is not Increment 5, an architectural redesign or a new investigation phase.**

The objective is to improve the existing Textual interface, making it feel more like a coherent native text-mode application and less like a conventional browser interface placed inside TUI-style frames.

Use the existing Textual architecture, layout primitives, measured cell geometry, application controllers and retained DOM.

Do not change graphical Flint or other graphical application presentations.

## 1. Priority: Redesign Gloss Explorer

The current Gloss Explorer presents each Gloss as an expanded collection of fields, buttons and relationship controls.

This results in excessive vertical spacing, poor information density and an appearance closer to a conventional web form than a classic TUI.

Replace this presentation with a compact **master-detail interface**.

### Master list

Display Glosses as a dense, navigable list.

Each row should contain:

- A selection indicator.
- Gloss type.
- A truncated summary of the Gloss text.
- Optionally, a compact occurrence count.

The list should support filtering and preserve the existing Gloss type selection and search functionality.

Selecting a row displays the corresponding Gloss in a detail region.

### Detail region

The detail region should expose:

- Complete Gloss type and text.
- Occurrence count.
- Passage navigation.
- Edit and Delete actions.
- Incoming and outgoing relationships.
- Add Relationship action.

Retain the existing Graph and Argument views.

The list and detail regions should be separated by cell-aligned borders or dividers, using existing Textual layout primitives.

### Interaction

Provide conventional keyboard navigation where practical:

- Up/Down to move through the Gloss list when it has focus.
- Enter to select or activate an item.
- Escape to leave the current interaction or close an appropriate transient control.

Do not override existing editor shortcuts or introduce global keyboard conflicts.

Preserve existing Gloss controllers, relationships, mutation services and navigation behaviour.

Do not rebuild Gloss functionality.

## 2. Document reading width

The screenshot shows exceptionally long lines of monospaced prose.

Although this demonstrates the available cell-grid width, it is not ideal for sustained reading.

Introduce an optional Textual presentation setting that constrains the readable prose width.

Suggested default target: approximately **80–90 cells**, subject to available viewport width.

Important requirements:

- This is a presentation constraint, not a change to Document content or metadata.
- Existing editing, selection, annotations and caret geometry must continue to function.
- The constraint should be responsive.
- Users should be able to disable it and use the full available width.
- Avoid wasting the reclaimed horizontal space unnecessarily; it may be used for margins or secondary regions where appropriate.
- Do not introduce a new Document layout or persistence model.

Use the existing measured cell geometry.

## 3. Improve typographic hierarchy

The screenshot shows Document titles, headings and body text with relatively little visual distinction.

Introduce a more deliberate Textual hierarchy using:

- Foreground and background colours.
- Bold or intensified text where appropriate.
- Inverse-video highlighting.
- Restrained cell-aligned separators.
- Existing semantic Block and styling information.

Preserve the mandatory monospaced font and deterministic cell-grid layout.

Do not introduce proportional typography or font-size changes that compromise the grid.

Do not rewrite authored style metadata.

## 4. Improve marginalia usability

The half-size marginalia subgrid is an important feature and should be retained.

However, the screenshot demonstrates that full marginal text can become difficult to read at normal viewing scale.

Investigate a lightweight presentation refinement:

- Show compact, readable marginal summaries.
- Preserve alignment with the corresponding Document passage.
- Make the selected or focused Gloss easy to identify.
- Allow convenient access to the full text through the existing Gloss Explorer or an appropriate lightweight expansion.
- Preserve the existing Half/Full display control.
- Maintain the existing placement, range caching and visibility mechanisms.

Avoid adding a new marginalia engine or introducing expensive range measurements during scrolling or typing.

Do not change canonical Gloss data or relationships.

## 5. Refine application chrome

The current screenshot shows several stacked horizontal regions containing Workspace menus, the Flint application title, Document tabs and other controls.

The bottom status area also contains unused space.

Improve the visual organization of these regions.

The desired hierarchy is:

1. Global Workspace menu.
2. Active application identity and Document tabs.
3. Contextual controls where required.
4. Main application content.
5. Compact status bar.

Reduce redundant vertical spacing and unnecessary repeated labels.

Keep all chrome aligned to the cell grid.

Preserve existing menu commands, application switching, Document switching and status information.

Do not introduce a new window manager.

## 6. Visual language

Retain the existing blue Borland-style palette as the default.

The intended aesthetic is:

- Dense and purposeful.
- Strongly monospaced.
- Clearly cell-based.
- Compact menus and controls.
- Crisp borders and separators.
- Restrained use of colour for selection and hierarchy.
- Consistent keyboard-oriented interaction.
- Minimal unnecessary whitespace.

Native HTML inputs, editors and rich-content islands remain acceptable. Their surrounding presentation should conform to Textual's visual vocabulary.

Do not replace functional native controls merely to imitate historical terminal limitations.

Monochrome and alternative palettes are outside this task.

## 7. Architectural boundaries

The following are explicitly outside scope:

- New editor implementations.
- New persistence mechanisms.
- Changes to canonical Document or Gloss models.
- New Block types.
- General-purpose TUI frameworks.
- New window managers.
- Movable or overlapping Textual windows.
- Comprehensive keyboard shortcut redesign.
- Changes to graphical application views.
- Reimplementation of native media or graph renderers.
- Broad refactoring unrelated to the visible usability issues.

Reuse existing components and services wherever practical.

If a shared change is genuinely necessary, keep it narrow, explain why it is needed and ensure graphical behaviour remains unchanged.

## 8. Implementation and qualification

Proceed directly with the refinement. A new research or planning phase is not required.

Work in this order:

1. Gloss Explorer master-detail redesign.
2. Reading-width constraint and visual hierarchy.
3. Marginalia readability and selection improvements.
4. Application chrome and status-bar refinement.

Keep the work bounded. Do not turn each item into a separate multi-stage implementation programme.

Use representative browser checks to verify:

- Gloss selection, filtering, editing, relationships and navigation.
- Keyboard navigation without conflicts with Flint.
- Document typing, selection and Undo/Redo with constrained reading width.
- Zoom and responsive reflow.
- Marginalia alignment and passage navigation.
- Desktop ↔ Textual restoration.
- No new snapshots or unnecessary repository-wide layout work during ordinary editing.

Reuse existing tests wherever possible. Do not repeat the complete qualification matrices from Increments 1–4.

## 9. Deliverables

Provide:

1. The implemented refinements.
2. A concise Markdown qualification report.
3. A new wide-layout screenshot showing Flint, marginalia and the redesigned Gloss Explorer.
4. A narrow-layout screenshot if the responsive behaviour materially changes.
5. A brief account of any remaining visual or usability limitations.

Do not begin another implementation phase automatically.

## Acceptance criterion

The Textual Workspace should feel like a coherent, information-dense, keyboard-oriented application, rather than a collection of graphical web controls inside retro frames.

**Preserve the existing architecture and functionality. Improve the presentation.**

The goal is a polished, usable Textual workspace, not a pixel-perfect reproduction of an obsolete DOS application.