// Opt-in work counts. The typing path never samples a clock or retains content
// for diagnostics. Only one measurement scope can own the counters at a time.
export function observeCellWork(timed = false) {
  if (cellWork) throw Error("Cell diagnostics already active");
  const counts = {addressPages:0, addressMembers:0, characterDescriptors:0, characterUpdates:0, characterPasses:0, allocations:0, hydrations:0, rebinds:0, evictions:0, splices:0, suffixWrites:0,
    endpointVisits:0, retargets:0, removedRanges:0, survivorListReads:0, numericExports:0,
    numericRanges:0, records:0, annotationViews:0, entityInventoryReads:0, mentionSurfaceChecks:0};
  cellWork = counts;
  const times = {prepare:0, apply:0, notify:0, flush:0};
  if (timed) cellStageTimes = times;
  return {counts, times, stop() { if (cellWork === counts) { cellWork = undefined; cellStageTimes = undefined; } }};
}
export let cellWork: ReturnType<typeof observeCellWork>["counts"] | undefined;

export let cellStageTimes: ReturnType<typeof observeCellWork>["times"] | undefined;
