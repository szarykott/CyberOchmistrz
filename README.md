# Contributing to CyberOchmistrz

## Prerequisites

Local machine needs:

- **Node.js** (v20+ recommended, matches CI `actions/setup-node@v4` default)
- **npm** (ships with Node)

No global TypeScript install needed — `tsc` runs via `ts-jest` and `next` from `node_modules`.

## Quick Start

```bash
npm install          # Install dependencies
npm run dev          # Dev server with Turbopack hot reload (localhost:3000)
npm run build        # Production build (static export to out/)
npm start            # Serve production build
npm run lint         # ESLint
npm test             # Jest test suite
```

---

## What the Code Does

**CyberOchmistrz** ("Cyber Steward") is a tool for a ship's second officer (ochmistrz) to prepare provisions for sailing cruises. Core features:

1. **Cookbook** (`/przepisy`) — Browse, add, edit recipes with ingredients, difficulty ratings, meal types
2. **Cruises** (`/rejsy`) — Create cruises (name, days, crew as tagged member list), assign recipes to each day via drag-and-drop with per-recipe portion count and meal slot, add extra supplies
3. **Shopping list generation** — Aggregate all ingredients from assigned recipes (scaled by each recipe's `crewCount`) + additional supplies into a categorized shopping list with CSV export
4. **Diet coverage check** — Per (day, mealSlot) max-flow analysis reports whether each meal feeds every crew member given their diet (omnivore / vegetarian / vegan) and per-member ingredient exclusions
5. **Supplies catalog** (`/skladniki`) — Browse and add ingredients/supplies used in recipes

Static data (recipes, supplies) ships in JSON. Cruises persisted in `localStorage`. Deployed as static site to GitHub Pages with PWA support.

## Intended Usage and Platform Requirements

- The application is distributed as a static site. Users must be able to use it without running an application server or backend.
- Supported platforms are PC, iOS, and Android.
- Phones are the primary devices. Design everyday workflows for small screens and touch interaction first.
- Cruise planning is often done on a computer, so its layout and interactions must also work well on desktop. It must remain usable on phones.
- Preserve static-export compatibility when adding functionality. UI changes should be checked on phone layouts; cruise-planning changes should also be checked on desktop.

---

## Directory Structure

```
CyberOchmistrz/
├── .agents/skills/domain-glossary/
│   └── SKILL.md               # Clarify domain terminology and maintain the glossary
├── .cursorignore              # Excludes build artifacts from Cursor indexing
├── .github/workflows/         # CI (test+build on PR) and CD (deploy to gh-pages on master push)
├── .vscode/                   # Debug launch configs for Next.js
├── docs/                      # Domain documentation and Mermaid entity diagrams
├── public/                    # PWA manifest, static SVGs
├── src/
│   ├── app/                   # Next.js App Router (routes, layouts, pages)
│   │   ├── layout.tsx         # Root layout: nav bar with links to 3 sections
│   │   ├── page.tsx           # Landing page with hero + links
│   │   ├── przepisy/          # /przepisy — recipe list, add, edit
│   │   ├── rejsy/             # /rejsy — cruise list/detail, add, edit
│   │   └── skladniki/         # /skladniki — supplies catalog, add
│   ├── components/            # All React components (see below)
│   │   └── AGENTS.md          # Component conventions for AI agents
│   ├── data/                  # Static JSON catalogs
│   │   ├── recipies.json      # ~20 recipes with ingredients, instructions
│   │   └── supplies.json      # ~100 supplies with units, categories, veg flags
│   ├── model/                 # Domain logic (no UI)
│   │   ├── AGENTS.md          # Model layer rules for AI agents
│   │   ├── cruise.ts          # Immutable cruise model and intention-focused operations
│   │   ├── cruiseData.ts      # Cruise persistence and restoration
│   │   ├── cruiseDietCoverage.ts  # Max-flow diet coverage (Dinic's algorithm), smart crewCount defaults
│   │   ├── crew.ts            # CrewMember (with excludedSupplies), Diet type, DIET_REGISTRY
│   │   ├── recipieData.ts     # Recipe loading, ingredient resolution, veg checks
│   │   ├── recipe.ts          # Recipe and ingredient quantity types
│   │   ├── supply.ts          # Supply and ingredient types
│   │   └── supplyData.ts      # Immutable supply catalog, filtering, validation
│   ├── types/                 # TypeScript interfaces and enums
│   │   └── index.ts           # Shared UI types
│   └── utils/
│       ├── cruiseFileIO.ts      # Cruise JSON export (download) and import (parse file)
│       ├── markdownExport.ts    # Markdown export for cruise menu (days, slots, recipes)
│       ├── maxFlow.ts           # Dinic's max-flow algorithm used by diet coverage
│       └── polishDeclension.ts  # Polish grammatical number for units
├── test/                      # Jest test suite
│   ├── AGENTS.md              # Test conventions for AI agents
│   ├── cruiseIntentions.test.ts  # Immutable cruise operations
│   ├── cruiseRestoration.test.ts # Serialized cruise restoration
│   └── cruiseUi.test.tsx      # Cruise UI interactions
├── GLOSSARY.md                # Canonical domain definitions and Polish equivalents
├── package.json
├── next.config.ts             # Static export + PWA config
├── jest.config.js
└── tsconfig.json
```

---

## Libraries

### Runtime dependencies

- **Next.js 15.3** — React framework, App Router, static export (`output: 'export'`)
- **React 19** — UI rendering
- **@dnd-kit/core + @dnd-kit/sortable** — Drag-and-drop for assigning/reordering recipes on cruise days
- **next-pwa** — Service worker generation for offline PWA support

### Dev dependencies

- **TypeScript 5** — Type safety
- **Tailwind CSS 4** (via `@tailwindcss/postcss`) — Utility-first styling
- **Jest 30 + ts-jest** — Unit testing
- **jest-theories** — Parameterized test cases
- **Testing Library + jest-environment-jsdom** — DOM interaction tests
- **ESLint 9 + eslint-config-next** — Linting

---

## State Management

No state library (Redux, Zustand, etc.). Pattern:

- **Static data:** JSON catalogs are bundled with the application. Supply APIs share an owned, immutable catalog and read-only views.
- **Persistent data:** `localStorage` access has an SSR guard (`typeof window === 'undefined'` returns empty). `getCruises()` and `getCruiseById()` restore immutable `Cruise` instances synchronously.
- **Restoration:** file imports and stored data are parsed as `unknown` and validated by `Cruise.fromData` before use or persistence. Existing cruise IDs and recipe snapshots are preserved; new cruise IDs are UUIDs.
- **Cruise state:** intention-focused model operations return immutable instances. Assignments own recipe snapshots and expose handles for edits, moves, and removal. The cruise provider publishes changed instances and skips publication when an operation returns the same instance.
- **Component state:** React `useState` + `useEffect` handles local state and hydration.

---

## Known Issues and Tech Debt

1. **localStorage only** — No sync between devices, no backend
2. **No online recipe/supply editing** — New items generate JSON for manual file merge
3. **No individual day add/remove** — Cruise duration can be changed; shortening warns when it removes recipes
4. **Typo in codebase** — "recipie" used consistently instead of "recipe" (in filenames, types, variables) — intentional per `.DotSettings` dictionary

---

## Domain Glossary

Read [GLOSSARY.md](GLOSSARY.md) for domain definitions and Polish equivalents. The repository-local [domain-glossary skill](.agents/skills/domain-glossary/SKILL.md) helps resolve ambiguous terminology and maintain agreed definitions without changing application code or creating ADRs.

See [domain entity diagrams](docs/domain-model.md) for relationships and mappings to code.

---

Live at: https://shadowdancer.github.io/CyberOchmistrz/

Static export means no server-side features — everything runs client-side.
