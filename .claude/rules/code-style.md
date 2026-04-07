---
paths: ["src/**"]
---

# Code Style & Design System

## Feature-Based Architecture
- Features in `src/features/{name}/` — self-contained, isolated
- Features do NOT import from each other
- Shared UI: `src/components/ui/` (shadcn/ui)
- Global styles: only in `src/app/globals.css` (tokens, reset, utilities, keyframes)

## CSS Rules
- `globals.css`: CSS variables, keyframes, reset, utilities only — no feature styles
- CSS Modules: `features/{feature}/styles/*.module.css` for feature styles
- Tailwind CSS: primary styling method for components
- `!important`: forbidden in globals; feature modules only with comment
- Inline styles: only for dynamic values

## UI Components
- shadcn/ui — primary library
- Radix UI — accessible primitives
- Tailwind CSS — utility classes
- Prefer standard solutions over custom implementations

## Tech Stack
- Next.js (App Router), React, TypeScript
- Tailwind CSS, shadcn/ui, Radix UI

## Design Guidelines
- Typography: consistent font sizes, Manrope (body), Geist (headings), JetBrains Mono (code)
- Animations: ease-out 240–300ms
- Accessibility: WCAG AA contrast, visible focus rings
- Numbers: `toLocaleString("ru-RU")`
- 44px min touch targets on mobile

## File Structure Examples
```
src/features/constructor/components/MyComponent.tsx     — feature component
src/features/constructor/styles/my-component.module.css — feature styles
src/components/ui/my-component.tsx                      — shared component
```

## Priorities
1. Architecture (modular structure)
2. Standard solutions (libraries over custom)
3. Isolation (feature-specific code)
4. Simplicity > complexity
5. Maintainability
6. Accessibility (WCAG AA)
