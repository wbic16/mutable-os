# Textual Workspace — Increment 3 Accepted

Increment 3 is accepted. Proceed to Increment 4.

The dedicated Scry/LER, Gloss, References and Cardex presentations satisfy the intended functional scope. The reuse of existing controllers, services, editor ownership and retained DOM is appropriate.

The bounded shared changes and targeted qualification are accepted. Do not reopen Increment 3 or repeat its complete test matrix.

## Increment 4 priorities

1. **Cell-grid fidelity.** Complete the remaining presentation alignment work, particularly pane boundaries, menus, tables, lists and instrument chrome. Reuse the existing measured grid geometry.

2. **Native rich-content islands.** Images, videos, graphs and other complex content may retain their native internal rendering. Their containing regions should align to the Textual cell grid where practical. Do not reconstruct functional media or graph renderers as character graphics.

3. **Marginalia.** Implement the previously agreed aligned half-size subgrid for marginal text, with appropriate reflow and zoom behaviour. Preserve the existing Gloss and annotation models.

4. **Persistent secondary regions.** Support the intended References and marginalia presentation without introducing a second window manager.

5. **Visual coherence.** Bring retained Cardex and other instrument controls into closer visual alignment with Textual. Adapt presentation and styling where necessary, but preserve the existing field editors, controllers, state and functionality.

6. **Visual direction.** Follow the supplied reference image: framed panes, compact menus, consistent box-drawing geometry and hard-edged cell-aligned shadows. Avoid merely embedding graphical application layouts inside decorative text-mode frames.

7. **Scope control.** Do not implement movable/overlapping Textual windows, a new window manager, comprehensive keyboard-binding redesign or speculative layout infrastructure.

8. **Testing.** Use representative browser checks for geometry, zoom, reflow, media, marginalia, navigation and Desktop restoration. Keep the qualification proportionate. Do not repeat previous increments' full matrices.

Maintain the Shared-Code Impact Register and preserve graphical presentation behaviour.

Proceed with the smallest practical changes needed to complete the agreed Textual visual and layout architecture. Report any genuine architectural blockers rather than expanding the implementation automatically.