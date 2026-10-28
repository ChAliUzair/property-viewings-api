# Property Viewings API

[![CI](https://github.com/ChAliUzair/property-viewings-api/actions/workflows/ci.yml/badge.svg)](https://github.com/ChAliUzair/property-viewings-api/actions/workflows/ci.yml)
![Node 20](https://img.shields.io/badge/node-20-339933)
![NestJS 11](https://img.shields.io/badge/NestJS-11-E0234E)
![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-336791)
![License MIT](https://img.shields.io/badge/license-MIT-blue)

A booking backend for rental-flat viewings. Agents list properties and publish viewing slots;
renters search listings and book a slot. The interesting part is correctness under load:
**two renters can never book the same slot, and two slots of one property can never overlap.**
Both rules are enforced by PostgreSQL constraints, so they hold even across multiple API instances.

> Built with NestJS, TypeScript (strict), PostgreSQL, Redis, TypeORM migrations, JWT with roles,
> OpenAPI docs, Jest unit + end-to-end tests, Docker Compose and GitHub Actions CI.

## Quick start

```bash
cp .env.example .env
docker compose up --build        # API on http://localhost:3000, docs on http://localhost:3000/docs
```

Seed demo data (one admin, one agent with two listings and slots, one renter):

```bash
npm ci
DATABASE_URL=postgres://app:app@localhost:5432/viewings npm run seed
# log in as admin@demo.local / agent@demo.local / renter@demo.local, password DemoPassw0rd
```

## Architecture

```mermaid
flowchart LR
    client([Client / Swagger UI]) -->|HTTPS + Bearer JWT| api

    subgraph api [NestJS API]
      direction TB
      guards[Throttler → JWT → Roles guards] --> controllers[Controllers + ValidationPipe]
      controllers --> services[Services]
    end

    services -->|TypeORM, migrations| pg[(PostgreSQL)]
    services -->|read-through cache| redis[(Redis)]

    pg -.->|EXCLUDE constraint: no overlapping slots| pg
    pg -.->|partial UNIQUE index: one confirmed booking per slot| pg
```

| Module | Responsibility |
|---|---|
| `auth` | Register (renters only), login, JWT strategy, bcrypt hashing with timing-safe failure path |
| `users` | `/users/me`; admins promote renters to agents |
| `properties` | Listing CRUD for agents (ownership enforced), public search with filters, sorting, pagination, Redis cache |
| `viewings` | Viewing slots per property, bookings, cancellations, agent and renter booking lists |
| `cache` | Redis read-through cache with versioned namespaces; degrades to the database if Redis is down |
| `health` | `GET /health` reports database and Redis reachability |

### Data model

```mermaid
erDiagram
    users ||--o{ properties : "lists (agent)"
    users ||--o{ bookings : "makes (renter)"
    properties ||--o{ viewing_slots : has
    viewing_slots ||--o{ bookings : "booked by (max 1 confirmed)"

    users {
      uuid id PK
      varchar email "unique, case-insensitive"
      user_role role
      varchar password_hash
    }
    properties {
      uuid id PK
      uuid agent_id FK
      varchar city
      numeric rooms
      int monthly_rent_cents
    }
    viewing_slots {
      uuid id PK
      uuid property_id FK
      timestamptz starts_at
      timestamptz ends_at
    }
    bookings {
      uuid id PK
      uuid slot_id FK
      uuid renter_id FK
      booking_status status
    }
```

## Design decisions

**1. Let the database arbitrate races.** The obvious implementation, "check the slot is free, then
insert", has a race window: two requests both see a free slot and both insert. Instead the
migration creates

```sql
CREATE UNIQUE INDEX uq_bookings_one_confirmed_per_slot ON bookings (slot_id) WHERE status = 'confirmed';
```

and the service simply inserts. Exactly one concurrent insert wins; the others get SQLSTATE
`23505`, which the service maps to `409 Conflict`. Cancelled bookings fall outside the partial
index, so a cancelled slot can be booked again. The e2e suite fires **20 simultaneous booking
requests at one slot and asserts exactly one 201 and nineteen 409s**.

**2. No overlapping slots, also enforced in SQL.** An exclusion constraint on
`tstzrange(starts_at, ends_at, '[)')` with `btree_gist` rejects overlapping slots for the same
property. Half-open ranges mean back-to-back slots (10:00–10:30, 10:30–11:00) are allowed.

**3. Cache invalidation without key scans.** Cached keys look like
`cache:properties:v42:<query>`. A write bumps the namespace version with one `INCR`, so old entries
become unreachable and expire by TTL. No `KEYS`/`SCAN`, no stale reads after an update (tested).
If Redis is unavailable the API keeps serving from PostgreSQL and `/health` reports `degraded`.

**4. Security defaults.** Global guards in a fixed order (rate limit → authenticate → authorise);
every route is private unless marked `@Public()`. `ValidationPipe` with `whitelist` and
`forbidNonWhitelisted` rejects unknown fields, so a client cannot send `"role": "admin"` at sign-up.
Login is limited to 10 attempts per minute per IP. Password hashes are never selected by default.
Money is stored as integer cents.

**5. Migrations, not `synchronize`.** The schema lives in a reviewed migration; the API runs
pending migrations on boot so a fresh container is usable immediately.

## API

Full interactive docs at `/docs` (OpenAPI 3, JSON at `/docs-json`).

| Method | Path | Who | Notes |
|---|---|---|---|
| `POST` | `/auth/register` | public | creates a renter |
| `POST` | `/auth/login` | public | returns `{ accessToken }`, 10 req/min |
| `GET` | `/users/me` | any user | |
| `PATCH` | `/users/:id/role` | admin | promote to agent |
| `GET` | `/properties` | public | `city`, `minRooms`, `maxRentCents`, `sort`, `page`, `limit` |
| `GET` | `/properties/:id` | public | |
| `POST` `PATCH` `DELETE` | `/properties[/:id]` | agent (owner) / admin | |
| `GET` | `/properties/:id/slots` | public | `from`, `to`; each slot has `isBooked` |
| `POST` | `/properties/:id/slots` | agent (owner) | 10–120 min, future only, no overlap |
| `DELETE` | `/slots/:id` | agent (owner) | 409 if a confirmed booking exists |
| `POST` | `/slots/:id/bookings` | renter | 409 if already booked |
| `GET` | `/bookings/me` | renter | paginated |
| `GET` | `/properties/:id/bookings` | agent (owner) | includes renter name and email |
| `PATCH` | `/bookings/:id/cancel` | renter, listing agent or admin | before the viewing starts |
| `GET` | `/health` | public | database + Redis status |

Example:

```bash
TOKEN=$(curl -s -X POST localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"email":"renter@demo.local","password":"DemoPassw0rd"}' | jq -r .accessToken)
curl -s "localhost:3000/properties?city=chemnitz&sort=rent_asc" | jq '.data[0].id'
curl -s -X POST localhost:3000/slots/<slotId>/bookings -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"note":"Coming with my partner"}'
```

## Testing

```bash
npm test              # unit tests (guards, services, cache) with mocks
npm run test:cov      # same, with coverage
docker compose up -d postgres redis
npm run test:e2e      # 18 end-to-end tests against real PostgreSQL + Redis
```

The e2e suite boots the real `AppModule`, runs the migrations against a dedicated `*_test`
database (it refuses to reset any database whose name does not end in `_test`) and covers auth,
role checks, validation, search, cache invalidation, slot rules, booking lifecycle, the
20-way booking race and the login rate limit.

CI (GitHub Actions) runs lint, Prettier, typecheck, unit tests with coverage and a build; the e2e
job runs against PostgreSQL 17 and Redis 7 service containers; a third job builds the Docker image.

## Project layout

```
src/
  auth/         register, login, JWT strategy
  users/        user entity, role management
  properties/   listings, search, ownership checks
  viewings/     slots, bookings, cancellations
  cache/        Redis client and versioned cache
  common/       guards, decorators, pagination, Postgres error mapping
  database/     data source, migrations, seed
  health/       health check
test/           e2e suite and helpers
```

## What I would add next

- Refresh tokens with rotation, and e-mail verification on sign-up
- Booking confirmation e-mails through a queue (BullMQ) with retries
- Per-renter limits (for example, no two bookings that overlap in time)
- Structured JSON logging with request IDs, and Prometheus metrics
- Deployment manifest (Fly.io or Render) with a managed PostgreSQL

## License

MIT
