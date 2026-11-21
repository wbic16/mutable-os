/** Only host-owned vocabulary crosses into repair instructions; never raw errors. */
const reasons = {
 xml:'Complete each XML fragment or the enclosing response element. Use enabled XML tags/attributes, unique local IDs and current @aliases. Preserve exact text; no DTD, HTML repair or surrounding fence.',
 json:'Return a complete JSON object matching the response schema.',
 fields:'Include exactly the required fields of this object.',
 'source-identity':'Obtain a fresh current-exchange source handle using bounded discovery, then read_source for its current revision. Historical handles and revisions cannot author content.',
 identity:'Use unique response-local IDs of the declared role: new:b for composition, new:r for source anchors, new:s for generated passages. Existing src: handles are host-issued. Styling reproduced quotations needs no id. When renaming an ID, update every dependent reference; never give a source anchor and reproduced text the same declaration ID.',
 source:'Use a complete current TextBlock source and its revision; quote exact text with unambiguous prefix/suffix.',
 'entity-mention':'Every new Entity needs a nonempty native mention: use e ref or annotation with mutable/entity-reference in generated text, or an interpretation with that ref on an authorised source target. Ground it in the intended passage; do not invent an occurrence or drop the Entity merely to pass validation.',
 markup:'Use annotation, b, i, e and self-closing boundary tags, valid XML escapes and nonempty spans. Check boundary IDs.',
 capability:'Use only negotiated types and operations; check the endpoint kinds and allowed attributes.',
 budget:'Keep the response within the advertised size, nesting and item limits.',
 structure:'Correct the invalid native structure while preserving valid requested structures.'
} as const;
export type ValidationDiagnostic={code:keyof typeof reasons;path:string;message:string};
export class DcpValidationError extends Error {
 constructor(readonly diagnostic:ValidationDiagnostic){super(`DCP validation at ${diagnostic.path}: ${diagnostic.message}`);}
}
export function validationDiagnostic(error:unknown,path='$'):ValidationDiagnostic {
 if(error instanceof DcpValidationError)return error.diagnostic;
 const message=error instanceof Error?error.message:'';
 const code:keyof typeof reasons=error instanceof SyntaxError?'json':/fields/.test(message)?'fields':/Unauthorized source handle|Anchor unavailable|Unavailable owned Entity|Gloss passage unavailable|Semantic target must use current/.test(message)?'source-identity':/selector|Selector|anchor source|exact anchor|splits a Cell|semantic quote|Semantic target needs/.test(message)?'source':/markup|Markup|boundary|annotation tag|Empty annotation|closing tag|unclosed/.test(message)?'markup':/Duplicate|provisional ID|Unauthorized|handle|endpoints|owned arguments/.test(message)?'identity':/budget|size|depth|oversized/.test(message)?'budget':/Unsupported|unavailable in|authorable|deferred|admitted|unavailable until/.test(message)?'capability':'structure';
 return {code,path,message:reasons[code]};
}
export function safeDiagnostic(value:any):ValidationDiagnostic {
 const code=Object.hasOwn(reasons,value?.code)?value.code as keyof typeof reasons:'structure';
 const path=typeof value?.path==='string'&&/^\$(?:\.(?:composition|anchors|interpretations|arguments|entities|relations|glosses|replyTargets)|\[\d{1,3}\]){0,16}$/.test(value.path)?value.path:'$';
 return {code,path,message:reasons[code]};
}

/** Recovery remains read-only and shares the original exchange's budgets. */
export const sourceRecoveryTools=['list_text_blocks','read_source','search_symposium','search_entities'] as const;
export const allowsSourceRecovery=(value:unknown)=>{const d=safeDiagnostic(value);return d.code==='source-identity'||d.code==='source'||d.code==='entity-mention';};
