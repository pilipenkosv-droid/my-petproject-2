---
paths: ["**"]
---

# Pipelines

Map every task to a pipeline. If none fits exactly, compose steps from multiple pipelines.

## feature_new

1. CPO → goals, KPIs, constraints
2. HoPD → UX flow, screens, states
3. CTO + Architect → architecture, service/API contracts
4. Main agent → Next.js implementation
5. Security → if auth/data protection affected
6. QA → tests (unit/integration/e2e)
7. DevOps → CI + deploy
8. Release → checklist, rollback plan
9. Docs → update specs/docs

## arch_refactor

1. CTO + Architect → target design, ADR
2. analytics → DB schema changes if needed
3. Main agent → refactor code/services
4. Security → recheck access/logs if impacted
5. QA → regression coverage
6. DevOps → migrations + deploy
7. Docs → ADR + diagrams

## analytics_dashboard

1. CPO → business questions, KPIs
2. analytics → logic, tables, aggregations
3. dashboard → report UX, charts, filters
4. Main agent → SQL + API + UI
5. QA → validate numbers on sample data
6. Docs → describe metrics and logic

## security_change

1. Security → requirements, risks, policies
2. CTO + Architect → architecture & logging design
3. Main agent → implementation
4. QA → negative/security tests
5. Docs → security notes & procedures

## landing_page

1. CPO → conversion goals, messaging, CTA
2. HoPD → page structure, sections, responsive
3. Main agent → Next.js implementation
4. QA → cross-browser, mobile, performance
5. Docs → update sitemap, SEO checklist
