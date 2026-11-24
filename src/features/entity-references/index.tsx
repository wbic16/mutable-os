import type { AnnotationCapabilities, CodexFeature, FeatureScope } from "../../feature-api";
import type { EntitySummaryLoader } from "./entity-summary";
import { EntitySearch } from "./search-view";
import { openEntitySearch } from "./entity-search";
import { DocumentEntityList } from "./document-entity-list";
import { EntityListWindow } from "./list-view";
import { EntityPropertyDetails } from "./property-details";
import { registerEntityBindings } from "./bindings";

export function createEntityReferencesFeature(capabilities: (scope: FeatureScope) => AnnotationCapabilities, summaries?: EntitySummaryLoader): CodexFeature & { readonly list: DocumentEntityList | undefined } {
  let list: DocumentEntityList | undefined;
  return {
    id: "entity-references", get list() { return list; },
    activate(scope) {
      const api = capabilities(scope);
      list = new DocumentEntityList(api, summaries);
      scope.own(() => list?.dispose());
      api.register.propertyType?.({type:'codex/entity-reference',renderers:[{id:'underline',name:'svg-underline',params:{color:'purple',opacity:api.caretEvents===false?1:.5}}],stateOrder:['caret-inside'],states:{'caret-inside':{underline:{opacity:1}}}});
      api.register.effect({ type: "codex/entity-reference", laneHeight: 2, caretOpacity: { outside: .5, inside: 1 }, render: ({ key, fragments, offset }) => fragments.map((fragment, index) => ({
        key: `${key}:underline:${index}`, path: `M ${fragment.x} ${fragment.y + fragment.height + 1.5 + offset} H ${fragment.x + fragment.width}`, stroke: "purple", fill: "none", strokeWidth: 2,
      })) });
      api.register.panel({ type: "entity-search", view: props => <EntitySearch api={api} panel={props.panel} /> });
      api.register.panel({ type: "entity-list", view: props => <EntityListWindow list={list!} panel={props.panel} /> });
      api.register.annotation({ id: "entity", type: "codex/entity-reference", label: "Entity reference", title: "Link selected text to an entity", apply: (ranges, key) => { openEntitySearch(api, ranges, key); }, details: EntityPropertyDetails });
      for (const id of ["entity.open", "cross.entity"]) api.register.command({ id, label: "Entity reference", canExecute: ({ targetKey }) => !!api.codeAnnotations?.supports(targetKey)||!!api.text(targetKey), execute: ({ targetKey }) => { if(api.codeAnnotations?.supports(targetKey))api.codeAnnotations.open(targetKey,'codex/entity-reference');else openEntitySearch(api, api.selection(targetKey), targetKey); } });
      for (const id of ["entity.list.open", "cross.entityList"]) api.register.command({ id, label: "Entities in Document", canExecute: ({ targetKey }) => !!api.codeAnnotations?.supports(targetKey)||!!api.text(targetKey), execute: ({ targetKey }) => { list!.open(targetKey); if (!list!.state.open) throw new Error(list!.state.error); } });
      api.register.action({ id: "entity.list", slot: "document-actions", command: "entity.list.open", label: "Entities", title: "Entities in Document", binding: "entity.list.open" });
      registerEntityBindings(api);
    },
  };
}
