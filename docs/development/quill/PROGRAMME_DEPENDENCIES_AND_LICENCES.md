# Quill programme dependencies and publication scope

No package or lockfile changes. Geometry, typography effects, UI icons, Q-and-feather vector and six ornament designs are original repository code under its MIT licence. The Raven example uses Poe's public-domain 1845 text. The two supplied PNGs and wireframe remain development references, not bundled application artwork; their redistribution rights are not inferred.

SVG admission reuses the existing **saxes 6.0.0** XML parser (ISC) and **xmlchars 2.2.0** (MIT). Complete upstream notices are retained in `licences/` and in `public/licences/quill-*.txt` for inclusion in client builds. Sources: [saxes v6.0.0 licence](https://github.com/lddubeau/saxes/blob/v6.0.0/LICENSE), [xmlchars v2.2.0 licence](https://github.com/lddubeau/xmlchars/blob/v2.2.0/LICENSE). No GPL/AGPL, LGPL or MPL code was added.

The Firefox qualification runner uses a temporary, external Playwright installation and downloaded test browser, not an application dependency. Its path is supplied explicitly through `PLAYWRIGHT_MODULE`; no browser binary is committed.

Fonts remain system/browser resources. The default is Georgia; the family control can request other installed fonts, with browser fallback. No font binary or raster artwork is bundled. SVG retains positioned text and family/style attributes, so another machine may substitute fonts; PNG captures the rendering on the exporting machine. Export does not embed font files or replace canonical Ink text with outlines.

## Shaping decision

[HarfBuzz.js](https://github.com/harfbuzz/harfbuzzjs) and the upstream [cluster model](https://harfbuzz.github.io/working-with-harfbuzz-clusters.html) were investigated. HarfBuzz needs actual font bytes and a qualified fallback/cluster pipeline; substituting it for browser measurement alone would not qualify bidirectional editing, IME or font licensing. It was not adopted in this programme.

SVG editing now uses `Intl.Segmenter` graphemes with explicit scalar, UTF-16 and caret spans. The admitted scope is Latin, Greek, Cyrillic, Han, Hangul, Hiragana, Katakana and common/inherited characters, including combining marks and emoji. Controls, inline objects, bidi and unqualified scripts use a labelled native fallback. Common-script admission is not a claim that every font or Unicode sequence has been visually qualified. Kerning/ligatures across separate graphemes and full IME remain native-fallback capabilities. Native annotations retain scalar ranges even where a range falls inside a painted grapheme.

## PDF evaluation

PDF export is not exposed. The available browser print route could publish a composition, but font embedding permissions, substituted fonts, transparency, clipping and consistent cross-browser output are not qualified. Imported SVG deliberately excludes filters and external resources. Shipping a PDF button with unverified fidelity would overstate support. SVG and PNG are explicit publication formats; native Ink remains the editable, semantic format.
