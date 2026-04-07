---
name: ship
description: |
  Release engineering: lint, test, review, changelog, commit, push, PR, deploy.
  Maps to feature_new pipeline steps 7-8 (DevOps + Release).
  Triggers on /ship, "deploy", "задеплоить", "create PR", "release".
  Invoke after /code-review approves the diff.
---

# Ship

Automated release workflow. Runs checks, creates PR, triggers Vercel deploy.

## Phase 1: Pre-flight Checks

```bash
# Detect base branch
BASE=$(git remote show origin 2>/dev/null | grep "HEAD branch" | awk '{print $NF}')
[ -z "$BASE" ] && BASE="main"
BRANCH=$(git branch --show-current)
echo "Shipping $BRANCH → $BASE"

# Ensure we're not on main
[ "$BRANCH" = "$BASE" ] && echo "ERROR: Cannot ship from $BASE directly" && exit 1
```

## Phase 2: Merge Base

```bash
git fetch origin $BASE
git merge origin/$BASE --no-edit
```

If conflicts → STOP. List conflicts, ask user to resolve.

## Phase 3: Quality Gates

Run all checks. ALL must pass before proceeding:

```bash
npm run lint
npm run build
npx vitest run
```

If any fail → STOP. Show output, suggest fixes. Do NOT skip failures.

## Phase 4: Review Diff

```bash
git diff origin/$BASE --stat
git log origin/$BASE..HEAD --oneline
```

If `/code-review` was not run this session, invoke it now on the diff.
If review returned REQUEST_CHANGES — STOP until changes are made.

## Phase 5: Changelog

Check if `CHANGELOG.md` exists. If yes, prepend entry:

```markdown
## [YYYY-MM-DD] — {branch-name}

- {summary of changes from commit messages}
```

If no CHANGELOG.md, skip this step.

## Phase 6: Commit & Push

```bash
# Stage any new files from merge/changelog
git add -A
git status

# Push with upstream tracking
git push -u origin $BRANCH
```

## Phase 7: Create PR

```bash
gh pr create \
  --base $BASE \
  --title "{concise title from commits}" \
  --body "## Changes

{bullet points from git log}

## Checks
- [x] Lint passed
- [x] Build passed
- [x] Tests passed
- [x] Code review: {APPROVE/APPROVE_WITH_CONCERNS}

## Deploy
Vercel auto-deploys on merge to $BASE."
```

## Phase 8: Post-Ship

After PR is created:
1. Print PR URL
2. Remind: "Vercel will auto-deploy when PR is merged to $BASE"
3. If APPROVE_WITH_CONCERNS from review → list the concerns

## Release Master Checklist

From `.claude/rules/agents.md` Release Master role:
- [ ] All quality gates passed
- [ ] No CRITICAL findings from `/security` or `/code-review`
- [ ] PR description includes what changed and why
- [ ] Rollback plan: revert the PR merge commit

## Status

- **DONE** — PR created, all checks passed, ready for merge
- **DONE_WITH_CONCERNS** — PR created, but review had concerns
- **BLOCKED** — checks failed, conflicts unresolved, or review rejected
