#!/bin/sh
set -eu
export BENCHMARK_HEADED=1 BENCHMARK_NATIVE_GPU=1 BENCHMARK_SKIP_SCREENSHOT=1
export BENCHMARK_SKIP_CPU_PROFILE=1 BENCHMARK_CELL_MEASUREMENTS=1
mkdir -p artifacts/dom-addressing
run() {
  fixture=$1; mode=$2; trial=$3; planner=${4:-resident}
  label=address-$mode-$trial
  dest=artifacts/cell-qualification/$fixture-$planner-$label
  last=stages.json
  if [ "${BENCHMARK_DOM_RETENTION:-0}" = 1 ]; then last=retention.json; fi
  if [ "${BENCHMARK_CELL_MEMORY:-0}" = 1 ]; then last=memory.json; fi
  if [ -s "$dest/$last" ]; then return; fi
  export BENCHMARK_IDENTITY_DOM=true
  if [ "$mode" = control ]; then export BENCHMARK_IDENTITY_DOM=false; fi
  node experiments/lightweight-cells/qualification/run.mjs "$fixture" "$planner" "$label" >"artifacts/dom-addressing/$fixture-$planner-$label.log" 2>&1
}
run 25000-20 identity 1
run 25000-20 control 1
run 25000-20 control 2
run 25000-20 identity 2
for fixture in 500-274 1000-1000 5000-500 25000-500 500-18 500-0 letter-native; do
  run "$fixture" control 1
  run "$fixture" identity 1
done
run 500-274 identity 2
run 500-274 control 2
(export BENCHMARK_CELL_INVENTORY=1; run 500-274 identity inventory; run 500-274 control inventory)
(export BENCHMARK_CELL_MEMORY=1; run 500-0-200 control viewport; run 500-0-200 identity viewport)
run 500-274 identity numeric numeric
(export BENCHMARK_CELL_TRACE=1; run 25000-20 identity trace; run 25000-20 control trace)
(BENCHMARK_DOM_BUILD=$(mktemp -d); export BENCHMARK_DOM_BUILD BENCHMARK_DOM_PRODUCTION=1
 trap 'rm -rf "$BENCHMARK_DOM_BUILD"' EXIT
 run 25000-20 identity production; run 25000-20 control production)
(export BENCHMARK_DOM_RETENTION=1; run 500-18 identity retention; run 500-18 control retention)
# Use the ordinary long-fixture workload for the sparse 100k extension.
run 100000-20 identity large
run 100000-20 control large
run 25000-20 control final
run 25000-20 identity final
