# Recovery evidence

`baseline.json` contains actual failed wire-receipt usage and settings records. `A1.json` and `B.json` contain the synthetic live requests, initial developer contracts, tool trails and native results. `B-retained-response.json` was retrieved read-only after the SSE byte limit hid the final receipt. `summary.json` includes that recovered usage. No successful contribution is claimed for B.

`input-counts.json` and `candidate-count.json` are OpenAI input-token-count endpoint measurements. The compact contract is an unimplemented review candidate, not the contract used in A/B. `whitespace-estimate.json` is explicitly a local tokenizer estimate. The failed live test log correctly records that the ten-contribution scenario was not completed.

The opt-in live harness uses temporary Documents and the existing continuity service. It bounds generation calls and tokens and stops a sequence on failure. Run only when another paid qualification is authorised:

```
DCP_RECOVERY_LIVE=1 npx vitest run docs/development/evidence/dcp-performance-recovery/live.test.ts
```

No credentials are retained in these artifacts. The native serialization fixture was written to a temporary directory and removed; no user Documents were edited.
