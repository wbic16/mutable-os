import { describe, expect, it } from "vitest";
import { cellStyleAt, compileCellStyleRuns, standoffCellStyles, standoffStyleSchema, standoffSvgStyles, type StandoffAnnotation } from "./standoff-styles";
import { outlineShapes, rainbowShapes, underlineShapes } from "./decorations";

const property = (type: string, rest: Partial<StandoffAnnotation> = {}): StandoffAnnotation => ({ type, start: 1, end: 3, ...rest });

describe("Standoff property appearance", () => {
  it("compiled intervals match the original cascade at every character and share styles within a run", () => {
    const annotations = [property("style/bold"), property("text/colour", { start: 2, end: 5, value: "red" }), property("style/underline"), property("style/strikethrough", { start: 3, end: 6 }), property("text/colour", { start: 3, end: 4, value: "blue" }), property("style/highlight"), property("text/background-colour", { value: "orange" }), property("style/italics", { isDeleted: true }), property("style/bold", { start: -1 }), property("codex/entity-reference")];
    const runs = compileCellStyleRuns(annotations);
    for (let index = 0; index < 12; index++) expect(cellStyleAt(runs, index)).toEqual(standoffCellStyles(index, annotations));
    expect(cellStyleAt(runs, 10)).toBe(cellStyleAt(runs, 11));
    expect(compileCellStyleRuns([property("codex/entity-reference", { end: 5000 })])).toEqual([{ start: 0, style: {} }]);
  });
  it("composes typography and colour over inclusive ranges without interpreting reference IDs as colours", () => {
    const annotations = [property("style/bold"), property("style/italics"), property("style/underline"), property("style/strikethrough"), property("text/colour", { value: "red" }), property("text/background-colour", { value: "lightblue" }), property("style/highlight"), property("codex/entity-reference", { value: "not-a-css-colour" })];
    expect(standoffCellStyles(0, annotations)).toEqual({});
    expect(standoffCellStyles(1, annotations)).toEqual({ "font-weight": "600", "font-style": "italic", "text-decoration-line": "underline line-through", color: "red", "background-color": "lightblue" });
    expect(standoffCellStyles(3, annotations)).toEqual(standoffCellStyles(1, annotations));
    expect(standoffCellStyles(4, annotations)).toEqual({});
    expect(standoffCellStyles(2, [...annotations, property("text/colour", { value: "blue" })]).color).toBe("blue");
  });

  it("distinguishes CSS highlights, superscript/subscript, uppercase and URL appearance", () => {
    expect(standoffCellStyles(2, [property("style/highlight")])).toEqual({ "background-color": "pink" });
    expect(standoffCellStyles(2, [property("codex/search/highlight")])).toEqual({ "background-color": "pink" });
    expect(standoffCellStyles(2, [property("style/highlighter")])).toEqual({});
    expect(standoffCellStyles(2, [property("style/superscript")])).toEqual({ "vertical-align": "super", "font-size": "0.8rem" });
    expect(standoffCellStyles(2, [property("style/subscript")])).toEqual({ "vertical-align": "sub", "font-size": "0.8rem" });
    expect(standoffCellStyles(2, [property("style/uppercase")])).toEqual({ "text-transform": "uppercase" });
    expect(standoffCellStyles(2, [property("reference/url")])).toEqual({ "text-decoration-line": "underline", "text-decoration-color": "blue" });
  });

  it("keeps compatibility aliases and excludes deleted, invalid, non-CSS and unknown types from Cell/SVG styling", () => {
    expect(standoffStyleSchema("style/strike")).toBe(standoffStyleSchema("style/strikethrough"));
    expect(standoffStyleSchema("style/color")).toBe(standoffStyleSchema("text/colour"));
    expect(standoffStyleSchema("style/blur")).toEqual({ regionEffect: true });
    expect(standoffStyleSchema("constructor")).toBeUndefined();
    const ignored = [property("style/bold", { isDeleted: true }), property("text/colour", { start: -1, value: "red" }), property("style/underline", { end: 0 }), property("style/bold", { end: Infinity }), property("future/highlight"), property("animation/spinner"), property("style/blur"), property("cell/micro-document")];
    expect(standoffCellStyles(2, ignored)).toEqual({});
    expect(standoffSvgStyles(ignored, 10)).toEqual([]);
  });

  it("composes glow, chromatic, ghost and ink effects as non-layout text shadows", () => {
    const style = standoffCellStyles(2, [
      property("style/glow", { radius: 4, intensity: .4 }),
      property("style/chromatic-aberration", { offset: 2, intensity: .3 }),
      property("style/ghost", { offsetX: 3, offsetY: 1, blur: 2, opacity: .25 }),
      property("style/ink-bleed", { spread: 1, intensity: .2, roughness: .4 }),
    ]);
    expect(style["text-shadow"]).toContain("0 0 4px");
    expect(style["text-shadow"]).toContain("-2px 0 0");
    expect(style["text-shadow"]).toContain("3px 1px 2px");
    expect(style["text-shadow"]?.split(", ").length).toBeGreaterThan(6);
    expect(style.width).toBeUndefined();
    expect(style.transform).toBeUndefined();
  });

  it("renders amber CRT as a sharp core with two bloom scales and a slight horizontal smear", () => {
    const style = standoffCellStyles(2, [property("amber-crt")]);
    expect(style.color).toBe("#ffd45a");
    expect(style["background-color"]).toBe("#17140d");
    expect(style["text-shadow"]).toContain("1.5px rgba(255, 176, 0, .92)");
    expect(style["text-shadow"]).toContain("4px rgba(255, 140, 0, .38)");
    expect(style["text-shadow"]).toContain(".65px 0 1px");
    expect(style.filter).toBeUndefined();
    expect(style.transform).toBeUndefined();
  });

  it("uses the original fixed semantic underline colours and 2px strokes", () => {
    const types = ["block", "trait", "claim", "meta-relation", "time"];
    const rendered = standoffSvgStyles(types.map((type) => property(`codex/${type}-reference`, { value: "entity-id" })), 10);
    expect(rendered.map(({ svg }) => svg.kind === "underline" && svg.colour)).toEqual(["green", "blue", "red", "orange", "cyan"]);
    expect(underlineShapes("line", [{ x: 0, y: 0, width: 30, height: 15 }], "purple")[0].strokeWidth).toBe(2);
  });

  it("allocates separate rainbow lanes only for overlapping underline-producing annotations", () => {
    const rendered = standoffSvgStyles([
      property("style/bold"), property("style/highlight"), property("style/rectangle"),
      property("style/rainbow"), property("codex/trait-reference"),
      property("codex/time-reference", { start: 5, end: 8 }),
      property("style/rainbow", { start: 2, end: 5 }),
      property("style/rainbow", { start: 20, end: 25 }),
    ], 10);
    expect(rendered.map(({ svg, offset }) => [svg.kind, offset])).toEqual([["rectangle", 0], ["rainbow", 0], ["underline", 15], ["underline", 0], ["rainbow", 18]]);
    const fragment = [{ x: 2, y: 3, width: 40, height: 18 }];
    const first = rainbowShapes("rainbow", fragment, rendered[1].offset);
    const line = underlineShapes("entity", fragment, "purple", rendered[2].offset);
    const y = (shape: { path: string }) => Number(shape.path.split(" ")[2]);
    expect(y(line[0])).toBeGreaterThan(y(first[6]) + 2);
    const rectangle = outlineShapes("rectangle", fragment, "red")[0];
    expect(rectangle).toMatchObject({ strokeWidth: 3, dashArray: "10 10", animated: true });
  });
});

it("reads each CSS boundary once across disjoint ranges and skips SVG offsets", () => {
  let reads = 0;
  const css = Array.from({length: 500}, (_, i) => ({
    type: "style/bold", get start() { reads++; return 2*i; }, get end() { reads++; return 2*i; },
  }));
  const runs = compileCellStyleRuns([...css, {type: "style/rectangle", get start(): number { throw Error("unrelated offset"); }}]);
  expect(reads).toBe(1000);
  expect(runs).toHaveLength(1000);
  expect(cellStyleAt(runs, 998)).toEqual({"font-weight":"600"});
  expect(cellStyleAt(runs, 999)).toEqual({});
});
