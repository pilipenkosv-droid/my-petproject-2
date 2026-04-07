---
name: code-review
description: |
  Pre-merge code review. Analyzes diff for vulnerabilities, architecture violations,
  and Diplox-specific rules (feature isolation, file limits, Nginx proxy).
  Triggers on /review, "review my diff", "проверь код", "code review".
  Use before /ship. Maps to feature_new pipeline step 6.
---

# Code Review

Staff-engineer-level review of current branch diff.

## Phase 1: Analyze Diff

```bash
BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null)
git diff $BASE --stat
git diff $BASE --name-only
```

Read changed files. Understand what was changed and why.

## Phase 2: Architecture Compliance

Check against Diplox rules (`.claude/rules/`):

### Scaling Limits (architecture-scaling.md)
- [ ] Files ≤300 lines
- [ ] Functions ≤50 lines
- [ ] Feature module ≤20 files, ~2000 lines total
- [ ] Directory nesting ≤3 levels

### Feature Isolation (code-style.md)
- [ ] Features do NOT import from each other (`src/features/X` never imports `src/features/Y`)
- [ ] Cross-feature deps go through `src/lib/`
- [ ] No prop drilling — use Zustand for feature-global state

### Code Style
- [ ] Russian for user-facing text; English for identifiers
- [ ] Imports ordered: react > next > libs > @/ > relative
- [ ] Forms use react-hook-form + zod
- [ ] UI uses shadcn/ui + Radix + Tailwind

### Nginx/Proxy (mcp.md)
If middleware or routing changed:
- [ ] Host detection uses `X-Forwarded-Host`, NOT `Host` header alone
- [ ] Vercel→diplox.online redirect intact in middleware
- [ ] No `X-Robots-Tag: noindex` leak through Nginx

## Phase 3: Vulnerability Scan

Search the diff for:

### SQL Safety
- Raw queries with string interpolation
- Missing parameterized queries in Supabase calls

### Trust Boundaries
- User input flowing into system prompts (AI model calls in `src/lib/ai/`)
- Unsanitized LLM output rendered as HTML (`dangerouslySetInnerHTML`)
- Unvalidated webhook payloads (Lava.top, bot endpoints)

### Auth & Sessions
- Supabase auth bypass or missing middleware checks
- Cookie handling changes affecting domain binding
- New API routes missing authentication

### Secrets
- Hardcoded API keys, tokens, credentials
- `.env` values committed
- Secrets in client-side code (Next.js `NEXT_PUBLIC_` leaking private vars)

## Phase 4: Logic Review

- State mutations with side effects — are they transactional?
- Error handling — do new API routes handle failures gracefully?
- Edge cases — empty arrays, null users, expired tokens, rate limits
- Performance — N+1 queries, missing indexes, unbounded loops

## Phase 5: Findings Report

```
CODE REVIEW REPORT
Branch: [branch name]
Files changed: [N]
Lines: +[added] -[removed]

CRITICAL (block merge):
- [finding with file:line]

HIGH (fix before ship):
- [finding with file:line]

MEDIUM (fix soon):
- [finding with file:line]

LOW (nice to have):
- [finding with file:line]

ARCHITECTURE:
- [compliance check results]

VERDICT: APPROVE | APPROVE_WITH_CONCERNS | REQUEST_CHANGES
```

## Next Steps

- If APPROVE → suggest `/ship` to deploy
- If REQUEST_CHANGES → list specific fixes needed
- If security findings → suggest `/security` audit

Status: DONE | DONE_WITH_CONCERNS | BLOCKED
