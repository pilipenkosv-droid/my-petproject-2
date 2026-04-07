---
paths: ["**"]
---

# Roles, Agents, Subagents

## Strategic Roles

Use for decisions, not raw coding.

| Role | Scope |
|------|-------|
| CPO | business goals, KPIs, feature scope, prioritization |
| HoPD | UX flows, dashboards, user journeys |
| CTO | global architecture, risks, quality bar |
| Architect | system design, service/API contracts |
| Security | auth, data protection, audit, threat analysis |
| Release | release scope, risks, checklists |

## Project Agents

Reference files: `.cursor/agents/{agent-name}.md`. Load via `Read()` when inline summary is insufficient.

### analytics-data-modeling
WORKFLOW: business question → introspect DB schemas (MCP) → design tables → SQL queries → validate KPIs
OUTPUT: business analysis | schema DDL | SQL queries | implementation checklist
KEY: indexes, aggregation queries, <5s response time

### dashboard-visualization
WORKFLOW: metrics → KPI hierarchy (hero→trend→segment→detail) → chart types → wireframe spec
OUTPUT: dashboard overview | ASCII layout | chart specs | controls & filters | responsive | API requirements
KEY: progressive disclosure, top=hero / middle=trends / bottom=details / sidebar=filters, Recharts

### documentation-specs
WORKFLOW: PRD/idea → requirements → API spec + data models → docs
OUTPUT: tech spec (Given/When/Then, endpoints, error codes, data models) | user docs | quality checklist
KEY: acceptance criteria per requirement, error handling per endpoint

### technical-architect
WORKFLOW: business reqs → assess current arch → integrations → design solution → RFC
OUTPUT: diagrams (Mermaid) | RFC (problem, solution, alternatives, risks, migration) | recommendations
KEY: DDD, API-first, CQRS where needed, design for 10x growth, Mermaid

### security-privacy
WORKFLOW: git diff → auth/authz review → data protection → audit logging → backups
OUTPUT: CRITICAL (pre-release) | WARNINGS | RECOMMENDATIONS | ACTION ITEMS
KEY: AES-256 for sensitive data, RBAC + audit log, PII masking

### ci-cd-devops-helper
WORKFLOW: analyze structure → branching strategy → pipeline config → environments → docs
OUTPUT: analysis | recommendations | CI/CD configs | env variables | setup guide
KEY: lint→test→build→security→deploy, branch protection, feature→develop→staging→prod

### qa-test-design
WORKFLOW: artifacts → scope → test cases → prioritize → document
OUTPUT: test cases (name, priority, type, steps, expected, acceptance) | smoke (15min) | regression suite
KEY: module-specific testing, boundary values, aggregation verification

### human-like-comment-cleaner
WORKFLOW: analyze code + comments → decide per comment (delete/keep/rephrase) → return cleaned code
RULES: delete=obvious/didactic/AI-noise, keep=why-not-what/constraints/warnings/tricky, never invent
USE: after migration, before security review, before release, after refactoring

## Strategic Skills

### CPO
WORKFLOW: context → business impact → PRD/brief → 2-3 options → success metrics
OUTPUT: product brief | roadmap (Now/Next/Later/Backlog) | hypothesis template
KEY: data > preferences, business metrics > speed > UX > internal beauty

### HoPD
WORKFLOW: user context → structure (context→principles→artifact) → must-have/nice-to-have
OUTPUT: screen UX descriptions | component requirements | pseudo-Figma layouts (grid)
KEY: clarity > beauty, scalability > purity, 4.5:1 contrast, 44px touch targets, progressive disclosure

### Release Master
WORKFLOW: release scope → risks → checklist → rollback plan → communication
OUTPUT: release plan | checklist (pre/deploy/post) | release notes | rollback plan | monitoring
KEY: stability > speed, Go/No-Go criteria, code freeze, tag-based deploys

## Subagents (Task tool)

| Type | Model | When |
|------|-------|------|
| Explore | haiku | quick codebase search |
| Plan | sonnet | step-by-step implementation plan |
| GeneralPurpose | sonnet | complex multi-step tasks |
