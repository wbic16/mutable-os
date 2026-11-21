# Quill M1 dependencies and licences

M1 introduces **no runtime package dependency, third-party source copy, font, image or external editor**. `package.json` and the lockfile are unchanged by this milestone.

The restricted Latin measurer, sampled line/sine arc geometry, linked-path fitter, hit testing and retained SVG glyph presenter are original repository code, covered by the repository's MIT licence. They use existing SolidJS, browser Canvas text measurement, SVG and DOM APIs. The existing native input gateway, operations, history, range-decoration renderers, document host and persistence remain authoritative.

Pretext, React-PDF Textkit and Pixerate were not imported, adapted or copied. Consequently there is no newly adopted upstream revision or dependency/asset notice to clear. Any later adoption still needs the revision, licence, transitive dependency, asset and attribution review specified in the brief.

The surface requests the system `Georgia` font with `serif` fallback. No font file is bundled or distributed. Measurement and SVG rendering use the same explicit family, size, bold and italic settings; ligatures and kerning are disabled for the restricted Latin glyph presenter. Font loading invalidates cached measurements. Publication/font embedding remains outside M1.

The existing M0 launcher icon remains unchanged. The seven unavailable concept PNGs are still not bundled or used as interface assets. The browser evidence is generated from this repository's actual UI and isolated test fixtures.
