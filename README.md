# AI Business Opportunity Scanner

Find local businesses with weak or missing online presence, score the opportunity (0–100), and give freelance web devs a reason to contact them.

## Documentation

All project docs live in [`docs/`](./docs):

| Doc | Purpose |
|---|---|
| [PRD.md](./docs/PRD.md) | What we're building — problem, users, scope, success criteria |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Tech stack, data flow, components, data model |
| [PLAN.md](./docs/PLAN.md) | Step-by-step implementation checklist (phases 0–10) |
| [AGENTS.md](./docs/AGENTS.md) | Rules for AI coding agents working in this repo |
| [ai-business-opportunity-scanner-mvp.md](./docs/ai-business-opportunity-scanner-mvp.md) | Original full MVP spec |

Start with `docs/PLAN.md` to see current progress.

## 🚀 Getting started

```bash
npm install          # Node 24+ recommended
cp .env.example .env.local   # fill in Supabase creds (Phase 0/1)
npm run dev          # http://localhost:3000

npm run typecheck    # tsc --noEmit
npm run test         # vitest
npm run lint         # eslint
npm run build        # production build
```

See `docs/AGENTS.md` for the environment variable reference.
