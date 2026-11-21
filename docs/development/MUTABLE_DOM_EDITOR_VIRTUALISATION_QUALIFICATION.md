# Bounded native text-flow virtualisation — qualification

2026-11-10

**Status: accepted and closed by the user.** The bounded Recommendation A implementation and its documented qualification are accepted. The measurements and coverage limits below remain the accepted scope.

Correctness checks pass for the qualified flows. Mounted DOM and setup time improved substantially, but measured scrolling became slower. The qualification recommendation remains to defer general default-on rollout pending scroll-performance tuning. At closure, the local `virtualTextFlows` setting is `true`; this closure preserves that setting without making a new performance or rollout claim.

## Implemented scope

`virtualTextFlows` was delivered with a `false` default and was subsequently enabled locally in `src/configuration.ts` before closure. The existing editor feature options also support explicit overrides. TanStack Solid Virtual 3.13.53 (core 3.19.11) renders occurrence-keyed native Block outlets for eligible flows of at least 64 TextBlocks/headings, directly inside a Document or its sole Page.

The native parent and canonical projection remain complete. Mixed media, inline images, owned margins, task controls, compound structures, multiple Pages, unqualified effects/transforms, passive views, and Spatial/Textual hosts retain the existing renderer. Desktop and Flint scrollports were exercised. These limits are qualification boundaries, not a permanent exclusion of rich content.

Semantic navigation and cross-Block selection now use existing occurrence identities, `parentOf`, and native presentation state instead of requiring mounted views. Active tabs/Surface faces, closed ancestors, collapsed lists, Concertina restrictions, independent margins, selection barriers, and stale/foreign occurrence checks remain authoritative. Native focus/reveal asks the flow to materialise an already chosen destination and rejects superseded requests. Vertical movement measures the chosen sibling's native text geometry, including when it lies outside the clipped viewport.

The integration uses TanStack's range, measurement, gap and scrolling facilities. Focus, selection endpoints, interaction owners and an editing window are retained through its range extractor. Retaining only the caret row proved insufficient: Solid could move its wrapper during reconciliation and Chrome lost composition focus. Keeping the current editing window as a stable DOM subsequence preserved trusted IME input. No alternate input gateway, navigation model, document representation, geometry cache or virtualisation engine was introduced.

Native fractional heights and parent gaps are preserved. Existing SVG range decorations and native views handle remounting. Flow eligibility has per-occurrence memos: ordinary text changes inspect only the affected paragraph's inline types. Selection validation follows actual model/presentation dependencies rather than every DOM mutation.

## Correctness and bounded work

139 tests passed across nine focused suites: virtual navigation, cross-Block selection, tabs, tab orientation, reversible Surfaces, Concertina, retained host presentations, direct character Cells and caret measurements. Both TypeScript projects pass typechecking.

The disposable real-Chrome exercise passed in Flint with 250 annotated paragraphs:

- Offscreen caret restoration and ordinary boundary movement through the existing input gateway.
- Wrapped vertical selection with preferred-X error of 2.27 px.
- Canonical selection/copy spanning unmounted paragraphs; selection survives scrolling.
- Trusted CDP composition retained across scrolling, committed once, then undone.
- Offscreen canonical search/reveal; dynamic heading sizing without overlapping its neighbor.
- Existing SVG preview retained semantically through eviction and redrawn after remount.
- Typing, Backspace, split, Undo/Redo, start/end/empty split boundaries, and unchanged unrelated Cells.
- Retained host transfer to a differently sized scrollport and back, preserving editor identity, caret, projection count and repository revision.
- Native capture/encode/decode/admission/recapture preserving all 25,251 records and text. This exercises persistence in memory; it does not overwrite a user file.
- An 80-paragraph mixed iframe flow remains on the original renderer, preserving the iframe's browsing context. An unqualified-host check retains all native views with a layout-transparent fallback wrapper.

Model-only tests cover absent mounts, inactive/closed content, independent margin navigation, repeated content projected into distinct occurrences, barriers and stale/foreign identities. Existing Surface, Concertina and tab suites check their presentation rules. Earlier browser checks also passed in standalone and Desktop hosts; the final full exercise ran in Flint.

Five large scroll jumps in the final Flint exercise retained at most 56 paragraph views. Instrumentation recorded **zero commits, repository snapshots, change notifications, selection validations or API requests**; repository revision and saved revision remained unchanged. No new persistence or dirty-tracking path was added. The disposable Flint fixture disables file persistence/knowledge services, so this is not a live Cavern save-button test. Native round-trip qualification is separate.

There is a remaining library-work cost: those jumps caused 12,811 item-key lookups and 137 element measurements for 250 paragraphs. That is virtualiser bookkeeping, not canonical model mutation, but it is material performance work. Stable-height typing in the 1,000-paragraph comparison caused zero virtualiser item-key lookups and zero repository snapshots. Regression tests also verify no flow-wide eligibility or unrelated paragraph rescans on ordinary typing.

## Measured comparison

Sequential runs of the real Flint fixture in headless Chrome, 1440×900, SwiftShader, Vite development mode: 1,000 paragraphs × 100 characters, each with a bold range; 40 timed edits. Both runs use the same fixture and native views. These are single runs, not statistical estimates of user-visible latency.

| Metric | Existing renderer | Virtual flow |
| --- | ---: | ---: |
| Initially mounted paragraphs | 1,000 | 21 |
| Mounted character spans | 100,000 | 2,100 |
| Mounted elements in fixture | 116,272 | 2,730 |
| Setup through two animation frames | 10,370.3 ms | 7,920.2 ms |
| Median edit-handler time | 2.2 ms | 1.7 ms |
| p95 edit-handler time | 8.4 ms | 7.2 ms |
| Maximum edit-handler time | 9.0 ms | 10.5 ms |
| Five 600 px scroll steps, each through two frames | 27.2–35.2 ms | 54.0–267.6 ms |
| Element geometry reads during those scroll steps | 118 | 190 |
| Range rectangle reads during those scroll steps | 0 | 0 |
| Maximum mounted paragraphs during those steps | 1,000 | 50 |

Mounted character spans fell **97.9%**, total elements **97.7%**, and setup time **23.6%**. Initial native paragraph height (30.296875 px) and paragraph step (42.296875 px) match exactly. Setup includes model/projection creation and rendering; it is not a first-paint metric. Handler timing excludes later paint. Scroll measurements include two animation frames and mounting work; they are not continuous-scroll FPS measurements.

The scroll regression is real in this run. Large-jump qualification was slower still (100–511 ms through two frames). The measurement/index counters identify a concrete follow-up for profiling, but do not by themselves establish the entire cause. No custom scheduler or virtualisation engine was added to conceal this cost.

## Reproduction and recommendation

With the dev server running, run the following twice, replacing `BENCHMARK_VIRTUAL=0` with `1`:

```sh
BENCHMARK_URL=http://localhost:3000/pilot BENCHMARK_PRESENTATION=flint BENCHMARK_BLOCKS=1000 BENCHMARK_VIRTUAL=0 BENCHMARK_SCROLL=1 node scripts/benchmark-typing-browser.mjs
```

Functional browser qualification:

```sh
BENCHMARK_URL=http://localhost:3000/pilot BENCHMARK_PRESENTATION=flint BENCHMARK_BLOCKS=250 BENCHMARK_VIRTUAL=1 BENCHMARK_VIRTUAL_QUALIFY=1 node scripts/benchmark-typing-browser.mjs
```

The pilot route avoids unrelated application-startup Cavern polling. Fixtures are disposable and in memory. No user Documents were changed or automatically saved.

Before general default-on rollout, the qualification recommendation is to profile and reduce native mount/measurement and TanStack suffix bookkeeping costs, repeat the Flint comparison, and qualify other browsers and longer interactive sessions. Large tables, compound/mixed flows, transformed hosts and a single enormous paragraph gain no DOM reduction from this increment. Total canonical model/projection memory is intentionally unchanged. No memory reduction claim or broad host qualification is made.

## Acceptance and closure

The user accepted and closed the bounded DOM editor virtualisation feature. Preserve the existing editor's navigation and selection authority, canonical model, native outlets and fallback rendering, input/IME retention, SVG decorations, and regression coverage.

Scroll-performance tuning, broader flow/host coverage and additional browser qualification are future work, not unfinished scope of this accepted increment. Closure does not start that work or change feature settings. No implementation changes or new test runs were needed for this documentation-only closure; the recorded qualification results remain the implementation evidence.
