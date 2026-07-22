# Retirefarm Manager

Next.js 16 + Prisma (SQLite) + NextAuth 귀농 관리 시스템

## Commands

```bash
npm run build          # Production build
npm run dev            # Development server
npm run lint           # ESLint
npm run db:generate    # Prisma client generate
npm run db:migrate     # Prisma migrate dev
npm run db:push        # Prisma schema push
npm run db:seed        # Seed database
docker compose up -d   # Production Docker
```

## Architecture

- `src/app/api/{domain}/{resource}/` — API routes (assets, auth, backup, dashboard, farm, funding, market, notifications, plan, reports, retirement, settings, setup)
- `src/components/` — React components (shadcn/ui base)
- `src/lib/` — Utilities, Prisma client, auth config
- `prisma/` — Schema, migrations, SQLite data

## Key Patterns

- DB: SQLite via Prisma singleton (`src/lib/prisma.ts`), always `prisma generate` before build
- Auth: NextAuth v4 + Portal SSO provider
- UI: shadcn/ui + Radix + Tailwind, mobile-first
- Validation: Zod schemas for all API input
- Docker: multi-stage build, non-root user (nextjs), SQLite volume at `/app/prisma/data`

## File Size Limits

Components MUST stay under 800 lines. Extract hooks/utilities when approaching limit.

## Verification

Before marking work complete:
- [ ] `npm run build` passes
- [ ] No console.log in source code
- [ ] Files under 800 lines
- [ ] API routes validate input with Zod
- [ ] Immutable patterns (no mutation)
