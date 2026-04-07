---
name: security-audit
description: |
  Security posture audit for Diplox. 8 phases: stack detection, attack surface,
  secrets archaeology, dependency audit, webhook security, LLM security, OWASP Top 10,
  findings report. Focused on Next.js + Supabase + Lava.top + AI model rotation.
  Triggers on /security, "security audit", "проверка безопасности", "OWASP".
  Maps to security_change pipeline step 1.
  Output format: CRITICAL / WARNINGS / RECOMMENDATIONS / ACTION ITEMS.
---

# Security Audit

Think like an attacker, report like a defender. No security theater — find doors that are actually unlocked.

**You do NOT make code changes.** Output is a Security Posture Report.

## Arguments
- `/security` — standard audit (all phases, high confidence only)
- `/security --quick` — fast scan (phases 1-3 only)
- `/security --diff` — branch changes only

## Phase 1: Architecture Mental Model

Read CLAUDE.md, `.claude/rules/mcp.md`, key config files. Map:
- Where does user input enter? (forms, API routes, webhooks, bot)
- Where does it exit? (DB, AI providers, email, Telegram)
- Trust boundaries: browser → Next.js → Supabase
- Payment flow: user → Diplox → Lava.top → webhook back

## Phase 2: Attack Surface Census

Use Grep to find and count:

**Code surface:**
- Public endpoints (no auth): API routes in `src/app/api/` without auth checks
- Authenticated endpoints: routes with Supabase session checks
- File upload points: document processing in `src/features/constructor/`
- Webhook receivers: `/api/payment/webhook`, `/api/bot/`
- AI endpoints: routes calling `src/lib/ai/`

**Output:**
```
ATTACK SURFACE MAP
  Public API routes:     N
  Authenticated routes:  N
  Webhook endpoints:     N
  File upload points:    N
  AI-powered endpoints:  N
  Cron jobs:             N (src/app/api/cron/)
```

## Phase 3: Secrets Archaeology

```bash
# Git history — known secret prefixes
git log -p --all -S "sk-" --diff-filter=A -- "*.env" "*.ts" "*.js" 2>/dev/null | head -20
git log -p --all -G "SUPABASE_SERVICE_ROLE" 2>/dev/null | head -20

# .env tracked by git?
git ls-files '*.env' '.env.*' 2>/dev/null | grep -v '.example\|.sample'

# Client-side secret leaks
grep -r "NEXT_PUBLIC_" src/ --include="*.ts" --include="*.tsx" | grep -i "secret\|key\|token\|password"
```

Check: Are Supabase service role keys, Lava.top secrets, AI API keys properly in `.env.local` and NOT committed?

## Phase 4: Dependency Audit

```bash
npm audit --production 2>/dev/null
```

Check for:
- Known CVEs in direct production dependencies
- Lockfile (`package-lock.json`) exists and is tracked
- No `postinstall` scripts in unfamiliar packages

## Phase 5: Webhook & Payment Security

**Critical for Lava.top integration:**

Use Grep on `src/app/api/payment/webhook/` and `src/lib/payment/`:
- Is webhook signature verified before processing?
- Is payment amount validated against expected amount?
- Can webhook be replayed? (idempotency check)
- Is webhook endpoint rate-limited?

**Bot endpoints:**
- Are Telegram bot webhooks verified?
- Can arbitrary users trigger bot commands?

## Phase 6: LLM & AI Security

Diplox rotates between Gemini, Groq, OpenRouter, Cerebras, OpenAI, Anthropic.

Check `src/lib/ai/`:
- **Prompt injection:** Does user text flow into system prompts? Search for string interpolation near system prompt construction
- **Output sanitization:** Is AI output rendered as HTML without sanitization? (`dangerouslySetInnerHTML`)
- **Cost attacks:** Can a user trigger unbounded AI calls? Rate limits on AI endpoints?
- **Key management:** Are all AI API keys in env vars (not hardcoded)?
- **Fallback chain:** Does fallback logic expose error details to users?

## Phase 7: OWASP Top 10 (Diplox-focused)

### A01: Broken Access Control
- Supabase RLS policies on all user data tables
- API routes check session before accessing user resources
- No direct object reference with user-controlled IDs

### A02: Cryptographic Failures
- Passwords handled by Supabase Auth (not custom)
- Payment data — check Lava.top handles PCI, we don't store cards
- AI API keys in env vars, not code

### A03: Injection
- SQL injection in Supabase queries (parameterized?)
- Command injection in any `exec`/`spawn` calls

### A05: Security Misconfiguration
- CORS on API routes
- CSP headers in Next.js config
- Nginx proxy stripping `X-Robots-Tag: noindex` (per mcp.md)
- Debug/verbose errors in production?

### A07: Auth Failures
- Supabase session management, token refresh
- Yandex OAuth flow validation
- Domain-bound cookies (diplox.online, not vercel.app)

## Phase 8: Findings Report

```
SECURITY POSTURE REPORT — Diplox
Date: YYYY-MM-DD
Scope: {full / quick / diff}

CRITICAL (fix immediately):
- [SEV] [Phase] [file:line] Description
  Impact: [what an attacker can do]
  Remediation: [specific fix]

WARNINGS (fix this sprint):
- [SEV] [Phase] [file:line] Description

RECOMMENDATIONS (improve over time):
- [description]

ACTION ITEMS:
- [ ] [specific task with owner]
```

## Next Steps

- CRITICAL findings → fix immediately, then `/investigate` for root cause
- After fixes → `/code-review` to verify
- Feed findings to security-privacy agent (`.cursor/agents/security-privacy.md`) for deeper analysis

Status: DONE | DONE_WITH_CONCERNS | BLOCKED
