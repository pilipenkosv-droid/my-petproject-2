# Git Workflow

## Branch Naming

Format: `w{week}/{year}-{short-description}`

- `{week}` — ISO week number (01–53)
- `{year}` — last two digits of the year
- `{short-description}` — kebab-case, 2-4 words max

Examples:
- `w15/26-payment-popup-fix`
- `w12/26-blog-cover-images`
- `w08/26-auth-middleware-redirect`

To get current week: `date +%V` (ISO week number).

## Branch Lifecycle

1. Create branch from `main` with proper naming
2. Develop, commit, push
3. Merge to `main` via PR (squash or merge commit)
4. After merge: keep the branch for **8 weeks** (2 months)
5. After 8 weeks: delete merged branch

## Post-Merge Verification

After merging to `main`:
- Verify CI passes on `main`
- Verify Vercel deployment succeeds
- Spot-check affected functionality on diplox.online

## Cleanup

- Merged branches older than 8 weeks — safe to delete
- To list stale merged branches:
  ```bash
  git branch --merged main --format='%(refname:short) %(committerdate:short)' | grep -v main
  ```
- Never delete `main`
