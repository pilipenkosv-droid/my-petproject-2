---
paths: ["**"]
---

# Architecture Scaling Rules

## Size Limits

| Target | Limit | On exceed |
|--------|-------|-----------|
| File (component/module) | ≤300 lines | Decompose into subcomponents |
| File (utils/helpers) | ≤200 lines | Split by domain |
| React component (JSX) | ≤150 lines | Extract subcomponents, hooks |
| Function/method | ≤50 lines | Extract subfunctions |
| Feature module (total files) | ≤20 files | Split into sub-features |
| Directory nesting | ≤3 levels | Flatten structure |
| Function parameters | ≤4 | Use options object |
| Imports per file | ≤15 | Signal to decompose |

## Module Self-Containment

- One feature module must fit in ~50% of context window (~100K tokens ≈ ~2000 lines)
- Interfaces between modules: typed contracts only (`types.ts` at module boundary)
- No circular dependencies: if A imports B, B must not import A
- Each `src/features/{name}/` must have `README.md` (5-10 lines): purpose, inputs/outputs, dependencies

## Documentation

- `docs/architecture.md` — module map and connections (update on every new feature)
- Non-trivial architectural decisions → ADR in `docs/adr/` (format: context, decision, consequences)
- On refactoring: update ADR first, then code

## Context Budget

When working on a task, load only:
1. CLAUDE.md + auto-loaded rules (~400 lines)
2. Target feature module files (~2000 lines max)
3. Shared types/interfaces as needed

If understanding a task requires >5000 lines — refactor before implementing.

## Decomposition Strategy

When a feature module approaches limits:
1. **Vertical split** — by business sub-scenario
2. **Horizontal split** — extract shared logic to `src/lib/` (no duplication between features)
3. **API boundary** — if module is too coupled, introduce facade layer

## Code Hygiene

- Dead code: delete immediately, do not comment out (git has history)
- TODO/FIXME: max 10 per module; older than 2 weeks → tracker task or delete
- console.log/debug: never commit; use structured logging
- Duplication: >3 repetitions → extract utility
- Types: `any` forbidden; use `unknown` + type guard

## PR Review Checklist

On every PR verify:
- [ ] No file exceeds 300 lines
- [ ] No new circular dependencies
- [ ] Feature module within limits
- [ ] Explicit types at module boundaries (no `any`)
- [ ] No hardcoded strings (use constants/enums)
- [ ] `docs/architecture.md` is up to date
