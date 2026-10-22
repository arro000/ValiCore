# Performance evidence

No performance budget or cross-platform speedup is claimed for this public beta.
Measurements from earlier experimental multi-domain builds do not describe its
fiscal/geographic runtimes and are not release evidence.

## Measurement requirements

Before profiling, retain a passing verification report for the exact revision,
including dirty-tree status, runtime and dataset hashes, and compiler identity.
Use the same snapshot, toolchain, workload and environment for comparisons. Do
not refresh live sources between trials or substitute build/test durations for
benchmarks.

Measure initialization separately from warmed domain operations and JSON
transport. Distinguish file-based Node initialization from actual browser
startup and HTTP transfer. Record cache state, cold/warm policy, all samples,
medians and host/browser versions; do not present one machine as a universal
result.

Artifact bytes, gzip/Brotli bytes, WASM linear-memory capacity, live requested
allocations, JavaScript heap and process RSS are different quantities. In
particular, a smaller artifact does not establish lower live memory usage.

Ownership/disposal checks in the Python and native verification suites are
bounded leak-regression observations, not performance guarantees or proofs
that every allocator will return memory to the operating system immediately.

Only publish measurements after verifying both selected component sets against
the same independent fiscal/geographic expectations. Never invoke excluded
experimental domains to warm a measured beta runtime.
