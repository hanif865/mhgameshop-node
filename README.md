# MH Game Shop — Node.js

Full Node.js rewrite of the MH Game Shop game top-up platform (originally
Laravel 10 + Filament 3), built as a **Turborepo monorepo**: an Express + Prisma
API, a Next.js 14 storefront, and a Next.js 14 admin panel.

## Structure

```
mhgameshop-node/
├── apps/
│   ├── api/     → Express + TypeScript REST API + Socket.io + BullMQ (port 4000)
│   ├── web/     → Next.js 14 storefront (port 3000)
│   └── admin/   → Next.js 14 admin panel (port 3001)
├── packages/
│   ├── database/ → Prisma schema, client, MySQL→Postgres migration
│   ├── types/    → Shared TypeScript types
│   └── ui/       → Shared UI tokens
├── nginx/nginx.conf
├── docker-compose.yml         → dev infra (Postgres + Redis)
├── docker-compose.prod.yml    → full production stack + nginx
└── turbo.json
```

## Tech stack

| Layer | Tech |
|---|---|
| API | Express, TypeScript, Prisma, Zod, JWT + Passport (Google), Helmet, rate-limit |
| Realtime | Socket.io (live order status + admin pending count) |
| Jobs | BullMQ + Redis (async auto-topup, 3 retries, refund on failure) |
| Cache | Redis (products & settings, 5-min TTL) |
| Payments | UddoktaPay gateway |
| Topup provider | TopupNet (UniPin voucher, shell, combo) |
| DB | PostgreSQL |
| Frontend | Next.js 14 App Router, Tailwind, PWA |

## Quick start (development)

```bash
npm install                                  # install all workspaces

cp .env.example .env                         # Postgres/Redis/MySQL vars
cp apps/api/.env.example apps/api/.env       # then fill in secrets
cp apps/web/.env.example apps/web/.env
cp apps/admin/.env.example apps/admin/.env

docker compose up -d                         # PostgreSQL + Redis

npm run db:generate                          # Prisma client
npm run db:push                              # create schema
npm run db:seed                              # baseline settings (optional)

npm run dev                                  # api + web + admin (turbo)
npm run worker -w @mhgs/api                  # (optional) auto-topup worker
```

- Storefront → http://localhost:3000
- Admin → http://localhost:3001 (log in with a user whose `role = admin`)
- API → http://localhost:4000 (health: `/api/health`)

## Migrating legacy MySQL data

Adds the old data into the new Postgres schema, translating every legacy quirk
(`avator→avatar`, `gauth_id→google_id`, `content→description`, spatie media→image,
spatie settings→key/value, `+/-`→`credit/debit`, order-status hyphen). Idempotent.

```bash
# put MYSQL_* vars in .env, ensure schema exists
npm run db:push
npm run migrate:mysql
```

## Environment variables

**`apps/api/.env`**

| Var | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `REDIS_URL` | Redis (cache + queue + settings) |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Auth tokens |
| `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_CALLBACK_URL` | Google OAuth |
| `TOPUPNET_API_KEY`, `TOPUPNET_BASE_URL` | Auto-topup provider |
| `UDDOKTAPAY_API_KEY`, `UDDOKTAPAY_BASE_URL` | Payment gateway |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Notifications |
| `APP_URL`, `WEB_URL`, `ADMIN_URL` | CORS + webhook + redirect URLs |

Most of these can also be set at runtime from **Admin → Settings** (which take
priority over env via the `gs()` helper).

**`apps/web/.env` / `apps/admin/.env`**

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## Commands

| Command | Description |
|---|---|
| `npm run dev` | All apps in dev mode |
| `npm run build` | Build everything |
| `npm run worker -w @mhgs/api` | Auto-topup queue worker |
| `npm run db:studio` | Prisma Studio |
| `npm run db:migrate` | Create/apply a Prisma migration |
| `npm run migrate:mysql` | Import legacy MySQL data |
| `npm run format` | Prettier |

## Production deployment

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Brings up: `postgres`, `redis`, `api`, `worker`, `web`, `admin`, and an `nginx`
reverse proxy. Configure DNS/SSL for:

- `mhgameshop.com` → web (3000)
- `admin.mhgameshop.com` → admin (3001)
- `api.mhgameshop.com` → api (4000) + `/socket.io` websocket

Run `npm run db:deploy -w @mhgs/database` once against the production DB to apply
migrations.

## API overview

All responses use `{ success, message?, data?, errors? }`.

- **Auth** — `POST /api/auth/register|login|logout`, `GET /api/auth/me`, `GET /api/auth/google`
- **Catalog** — `GET /api/products`, `GET /api/products/:slug`, `GET /api/sliders`, `GET /api/settings`
- **Orders** — `POST /api/orders` (wallet/gateway, combo via `combo-{id}`), `GET /api/orders[/:id]`
- **Wallet** — `POST /api/deposits/initiate`, `POST /api/webhook/uddoktapay`
- **Auto-topup** — `POST /api/webhook/auto-topup` (normal + `orderId-itemIndex` combo)
- **User** — `/api/user/profile|orders|codes|transactions`
- **UID checker** — `POST /api/uid-checker`
- **Admin** — `/api/admin/*` (dashboard, categories, products, variations, vouchers,
  auto-vouchers, combos, orders, users, deposits, transactions, shells, sliders,
  pages, settings) — all behind `requireAdmin`.

## Build history

Phase 1 monorepo + Prisma + migration · Phase 2 auth/products/orders/webhooks ·
Phase 3 admin API · Phase 4 storefront · Phase 5 admin panel ·
Phase 6 realtime, queue, caching, security, deployment.
