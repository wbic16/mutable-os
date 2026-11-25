#!/bin/sh
# Run from the repository root. Each launch owns a separate Chrome profile.
set -eu
export BENCHMARK_SKIP_SCREENSHOT=1
mkdir -p artifacts/cell-qualification
run_pair() {
  fixture=$1
  trial=$2
  shift 2
  for mode in "$@"; do
    dest="artifacts/cell-qualification/$fixture-$mode-$trial"
    if [ -s "$dest/stages.json" ] && { [ "${BENCHMARK_CELL_MEMORY:-0}" != 1 ] || [ -s "$dest/memory.json" ]; }; then continue; fi
    node experiments/lightweight-cells/qualification/run.mjs "$fixture" "$mode" "$trial" >"$dest.log" 2>&1
  done
}
run_pair 500-274 1 numeric resident
run_pair 500-18 1 resident numeric
run_pair letter-dense 1 resident numeric
run_pair letter-dense 2 numeric resident
(export BENCHMARK_CELL_TRACE=1; run_pair 500-274 trace numeric resident)
(export BENCHMARK_CELL_MEMORY=1; run_pair 500-0-200 viewport resident numeric)
(export BENCHMARK_HEADED=1; run_pair 500-274 headed resident numeric)
run_pair 1000-1000 1 numeric resident
run_pair 5000-500 1 resident numeric
run_pair letter-native 1 numeric resident
run_pair 500-274 2 resident numeric
run_pair 500-18 2 numeric resident
(export BENCHMARK_CELL_INVENTORY=1; run_pair 500-274 inventory numeric resident)
run_pair 500-274-200 viewport resident numeric
run_pair 25000-20 1 resident numeric
run_pair 1000-20 1 resident numeric
(export BENCHMARK_CELL_MEMORY=1 BENCHMARK_CELL_RETAINERS=1; run_pair 500-0-200 retention resident)
(export BENCHMARK_HEADED=1 BENCHMARK_NATIVE_GPU=1; run_pair 500-274 hardware numeric resident)
run_pair 25000-20 2 numeric resident
(export BENCHMARK_HEADED=1 BENCHMARK_NATIVE_GPU=1; run_pair 500-274 hardware2 resident numeric)
(export BENCHMARK_SKIP_CPU_PROFILE=1; run_pair 25000-20 unprofiled resident numeric)
