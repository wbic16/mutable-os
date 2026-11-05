import type { CodexFeature, FeatureScope } from "../../feature-api";
import type { DocumentApplicationCapabilities } from "../../feature-api/document-application";
import { FlintView } from "./shell";
import { createFlintDocumentTabs } from "./document-tabs";
import "./flint.css";
import "./spatial-shell.css";
import "./compact-shell.css";

export function createFlintFeature(capabilities: (scope: FeatureScope) => DocumentApplicationCapabilities, materialChrome = true, probe = true, spatialGraph = true, logo = true, compactShell = true): CodexFeature {
  return { id: "flint", activate(scope) {
    capabilities(scope).register({ applicationId: "flint", type: "flint-application-block", view: props => <FlintView {...props} materialChrome={materialChrome} probe={probe} spatialGraph={spatialGraph} logo={logo} compactShell={compactShell} />,
      create: createFlintDocumentTabs,
    });
  } };
}
