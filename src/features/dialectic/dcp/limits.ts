/** Admission limits shared by preparation, discovery and provider schemas. */
export const compositionLimits = {
 responseBytes:262144, nodes:256, depth:12, outputCells:24000,
 roots:64, groupChildren:64, listItems:64, itemChildren:32,
 tableRows:64, tableColumns:16, cellChildren:32, anchors:32,
} as const;
export const capabilityLimits = {ids:4, idLength:64, bytes:8192} as const;
