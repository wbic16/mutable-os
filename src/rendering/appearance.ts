import type { JSX } from "solid-js";
import type { BlockNode } from "../block-tree/types";

type BlockProperty = {
  type?: string;
  value?: string | number;
  metadata?: Record<string, unknown>;
};

const fontSizes: Record<string, string> = {
  h1: "var(--document-heading-h1, 3rem)",
  h2: "var(--document-heading-h2, 2.5rem)",
  h3: "var(--document-heading-h3, 2rem)",
  h4: "var(--document-heading-h4, 1.5rem)",
  h5: "var(--document-heading-h5, 1.25rem)",
  h6: "var(--document-heading-h6, 1rem)",
  normal: "1rem",
  "three-quarters": ".75rem",
  half: ".5rem",
};

function cssSize(value: unknown): string | undefined {
  if (typeof value === "number") return `${value}px`;
  return typeof value === "string" ? value : undefined;
}

export function blockAppearance(node: BlockNode | undefined): {
  classes: string[];
  style: JSX.CSSProperties;
} {
  const properties = (node?.payload.blockProperties as BlockProperty[] | undefined) ?? [];
  const classes: string[] = [];
  const style: JSX.CSSProperties = {};

  for (const property of properties) {
    const metadata = property.metadata ?? {};
    switch (property.type) {
      case "block/rotate":
        style.transform = `rotate(${property.value ?? 0}deg)`;
        style["transform-origin"] = "center";
        break;
      case "block/alignment":
        style["text-align"] = String(property.value ?? "left") as JSX.CSSProperties["text-align"];
        break;
      case "block/alignment/left":
        style["text-align"] = "left";
        break;
      case "block/alignment/center":
        style["text-align"] = "center";
        break;
      case "block/alignment/right":
        style["text-align"] = "right";
        break;
      case "block/font/size": {
        const size = fontSizes[String(property.value ?? "normal")] ?? String(property.value ?? "1rem");
        style["font-size"] = size;
        style["line-height"] = String(property.value ?? "normal").startsWith("h") ? `var(--document-heading-${String(property.value)}-line-height, ${size})` : size;
        break;
      }
      case "block/indent":
        style["margin-left"] = `${Number(property.value ?? 0) * 20}px`;
        break;
      case "block/font/size/three-quarters":
        classes.push("block_font-size_three-quarters");
        style["font-size"] = ".75rem";
        break;
      case "block/font/size/half":
        classes.push("font_size_half");
        break;
      case "block/font/size/h1":
      case "block/font/size/h2":
      case "block/font/size/h3":
      case "block/font/size/h4": {
        const token = property.type.slice(-2);
        style["font-size"] = fontSizes[token];
        style["line-height"] = `var(--document-heading-${token}-line-height, ${fontSizes[token]})`;
        break;
      }
      case "block/margin/top/20px":
        style["margin-top"] = "20px";
        break;
      case "block/margin/top/40px":
        style["margin-top"] = "40px";
        break;
      case "block/size":
        style.width = cssSize(metadata.width);
        style.height = cssSize(metadata.height);
        style["min-width"] = cssSize(metadata["min-width"]);
        style["overflow-y"] = "auto";
        style["overflow-x"] = "hidden";
        break;
      case "block/position":
        style.position = String(metadata.position ?? "absolute") as JSX.CSSProperties["position"];
        style.left = cssSize(metadata.x);
        style.top = cssSize(metadata.y);
        break;
      case "block/margin":
        style["margin-top"] = cssSize(metadata.top);
        style["margin-right"] = cssSize(metadata.right);
        style["margin-bottom"] = cssSize(metadata.bottom);
        style["margin-left"] = cssSize(metadata.left);
        break;
      case "block/theme/glass":
        classes.push("block_theme_glass");
        break;
      case "block/theme/paper":
        classes.push("block_theme_paper");
        break;
    }
  }
  return { classes, style };
}
