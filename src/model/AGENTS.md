Pure domain logic — no React, no UI imports. Must be testable in isolation.

## Conventions

- Validation functions return Polish error strings
- Sort with `localeCompare(..., 'pl')` for Polish alphabetical order
- Keep browser storage and static JSON imports in `src/data`. Cruise storage uses the key `cyber-ochmistrz-cruises` and guards against access during server rendering.
