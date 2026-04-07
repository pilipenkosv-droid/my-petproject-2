---
name: investigate
description: |
  Systematic debugging with root cause investigation. 5-phase workflow with 3-strike
  escalation rule. No fixes without root cause. Diplox-specific: checks Supabase auth,
  Lava.top webhooks, Nginx proxy, AI model rotation.
  Triggers on /investigate, "баг", "ошибка", "сломалось", "500 error", "не работает".
  Proactively invoke when user reports a bug or error.
---

# Systematic Debugging

## Iron Law

**NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.**

Fixing symptoms creates whack-a-mole debugging. Find the root cause, then fix it.

## Phase 1: Root Cause Investigation

1. **Collect symptoms:** Read error messages, stack traces, repro steps. If insufficient — ask ONE question via AskUserQuestion.

2. **Read the code:** Trace the code path from symptom to potential causes. Use Grep for references, Read for logic.

3. **Check recent changes:**
   ```bash
   git log --oneline -20 -- <affected-files>
   ```
   Was this working before? Regression = root cause is in the diff.

4. **Reproduce:** Can you trigger the bug deterministically? If not, gather more evidence.

5. **Diplox-specific checks:**
   - Auth issues → check `src/middleware.ts` (X-Forwarded-Host, Vercel→diplox.online redirect)
   - Payment issues → check `src/lib/payment/lava-client.ts` webhook signature verification
   - AI failures → check `src/lib/ai/` model rotation and fallback chain
   - Proxy issues → check Nginx config rules in `.claude/rules/mcp.md`
   - DB issues → check Supabase logs and query patterns

Output: **"Root cause hypothesis: ..."** — specific, testable claim.

## Phase 2: Pattern Analysis

Check against known patterns:

| Pattern | Signature | Where to look |
|---------|-----------|---------------|
| Race condition | Intermittent, timing-dependent | Concurrent state access |
| Null propagation | TypeError, undefined | Missing guards on optional values |
| State corruption | Inconsistent data | Supabase transactions, React state |
| Integration failure | Timeout, unexpected response | Lava.top API, AI providers |
| Config drift | Works locally, fails on Vercel | Env vars, middleware, Nginx proxy headers |
| Stale cache | Shows old data | Next.js ISR, browser cache, Supabase cache |
| Auth mismatch | 401/403, cookie issues | Supabase SSR middleware, domain binding |
| Feature isolation break | Import errors, circular deps | Features importing from each other (violates architecture) |

Also check:
- `git log` for prior fixes in same area — recurring bugs = architectural smell
- `.claude/rules/architecture-scaling.md` — if affected code exceeds size limits

## Phase 3: Hypothesis Testing

Before writing ANY fix, verify the hypothesis.

1. **Confirm:** Add temporary log/assertion at suspected root cause. Run repro. Does evidence match?

2. **If wrong:** Return to Phase 1. Gather more evidence. Do not guess.

3. **3-strike rule:** If 3 hypotheses fail, STOP. Ask via AskUserQuestion:
   > 3 hypotheses tested, none match. This may be architectural.
   > A) Continue — I have a new lead: [describe]
   > B) Escalate — needs someone who knows the system deeper
   > C) Add logging and catch it next time

**Red flags — slow down if you see:**
- "Quick fix for now" — fix it right or escalate
- Proposing a fix before tracing data flow — you're guessing
- Each fix reveals a new problem — wrong layer, not wrong code

## Phase 4: Implementation

Once root cause is confirmed:

1. **Fix the root cause, not the symptom.** Smallest change that eliminates the problem.

2. **Minimal diff.** Fewest files, fewest lines. Resist refactoring adjacent code.

3. **Write a regression test** that fails without fix, passes with fix:
   ```bash
   npx vitest run <test-file>
   ```

4. **Run full checks:**
   ```bash
   npm run lint && npm run build && npx vitest run
   ```

5. **If fix touches >5 files** → AskUserQuestion about blast radius before proceeding.

6. **Check scaling rules:** Verify new/modified files stay within `.claude/rules/architecture-scaling.md` limits (file ≤300 lines, function ≤50 lines).

## Phase 5: Verification & Report

**Fresh verification:** Reproduce the original bug and confirm it's fixed.

Output structured report:
```
DEBUG REPORT
Symptom:         [what user observed]
Root cause:      [what was actually wrong]
Fix:             [what changed, file:line references]
Evidence:        [test output proving fix works]
Regression test: [file:line of new test]
Status:          DONE | DONE_WITH_CONCERNS | BLOCKED
```

## Next Steps

After successful fix:
- Suggest `/code-review` to verify diff quality before merge
- Suggest `/ship` to deploy the fix
- If security-related → suggest `/security` audit on affected area

Status codes:
- **DONE** — root cause found, fixed, regression test written, all checks pass
- **DONE_WITH_CONCERNS** — fixed but can't fully verify (intermittent, needs staging)
- **BLOCKED** — root cause unclear after investigation, escalated
