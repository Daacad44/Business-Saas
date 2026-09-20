# Project Gaan — Warbixin Buuxda

**Product:** Daljir Business Platform / Daljir Inventory  
**Company:** Daljir Technology  
**CEO & Founder:** Abdishakur Botan Warsame  
**Tagline:** Creating what moves you forward  
**Repo:** [Daacad44/Business-Saas](https://github.com/Daacad44/Business-Saas) (`main`)  
**Taariikhda warbixinta:** 20 Sebtembar 2026  
**Xigashada:** koodhka `main` (commits `c5216d0`, `f1e5180`), `docs/`, Prisma schema, API routes, web pages, GitHub issues/PRs/CI

Warbixintan waa xaalad dhab ah, ma aha qorshe. Wax kasta oo hoos ku qoran waa la hubiyey koodhka, ma aha kalsooni blueprint-ka oo keliya.

---

## 1. Kooban — Executive Summary

Project Gaan waa Daljir Business Platform: SaaS multi-tenant ah oo loogu talagalay tafaariiqda iyo jumlada inay ku maamulaan alaabta, POS, macaamiisha, deynta, iyo xasuusinta tooska ah.

**Xaaladda maanta:** aasaaska SaaS (Weji 1) waa la dhisay oo wuu shaqeeyaa. Alaabta, POS, deynta, iyo automation-ka **wali ma jiraan**. Macmiil dhab ah kuma iibin karo, kuma qori karo deyn, kuma diro WhatsApp.

| Qiyaas | Xaalad |
|--------|--------|
| Weji 0 — Qorshe & blueprint | **~90%** — dukumentiyo dhammaystiran; CI/CD ma jiro |
| Weji 1 — SaaS foundation | **~85%** — auth, tenant, RBAC, onboarding, laamo, bakhaaro |
| Weji 2–9 — inventory ilaa launch | **~0% koodh** — qorshe, ogolaansho (permissions), iyo settings-ka aamusnaanta kaliya |
| Platform-ka oo dhan (MVP production) | **~12–15%** |
| Diyaar u ah macaamiil ganacsi | **Maya** |

Laba commit ayaa ku jira `main` (19 Sebtembar 2026). Issues, pull requests, iyo GitHub Actions **ma jiraan**. Repo-ga waa public.

**Farqiga ugu muhiimsan ee laga doonayo:** iibka credit-ka wuxuu noqdaa deyn + taariikh dhimasho + xasuusin. Taasi weli waa naqshad (`docs/06-Automation/`), ma aha software shaqeeya.

---

## 2. Scorecard — sida wejiyadu u socdaan

Qorshaha rasmiga ah waa `docs/08-Roadmap/development-roadmap.md` (Weji 0–9).

| Weji | Ujeeddo | Xaalad | Faahfaahin |
|------|---------|--------|------------|
| **0** Foundation | PRD, architecture, ERD, API, UX, amni, CI/CD | **Qorshe dhamaystiran; CI ma jiro** | 13 dukumenti `docs/`. Ma jiro `.github/workflows`. |
| **1** SaaS foundation | Auth, tenant, RBAC, ganacsi, martiqaad, laamo, bakhaaro | **Inta badan dhamaystiran** | API + UI + Prisma. Eeg qaybta 3. |
| **2** Inventory | Products, SKU, barcode, stock, movements, transfers | **Ma dhisna** | Permission keys ayaa la beeray; ma jiraan tables ama routes. |
| **3** Sales / POS | POS, invoices, payments, returns, credit sales | **Ma dhisna** | |
| **4** Customer / Debt | Customers, credit limits, aging, collection | **Ma dhisna** | |
| **5** Automation | Redis, BullMQ, WhatsApp/SMS/email, retry logs | **Stub kaliya** | Worker wuxuu daabacaa fariin; Redis Docker waa diyaar laakiin API ma isticmaalo. |
| **6** Purchases | Suppliers, POs, receiving | **Ma dhisna** | |
| **7** Reports | Sales, inventory, debts, profit, exports | **Ma dhisna** | |
| **8** Super Admin & SaaS | Plans, subscriptions, platform analytics | **Ma dhisna** | |
| **9** Hardening | E2E, monitoring, backups, launch | **Ma dhisna** | Hal fayl tijaabo API ah. |

---

## 3. Wixii maanta shaqeeya (Weji 1)

### 3.1 Socodka isticmaalaha

1. **Diiwaangelin / soo gal / ka bax** — cookie JWT + session DB, argon2id, refresh-token rotation.
2. **Onboarding ganacsi** — magac, nooc, lacag, laan ugu horreysa, bakhaar ugu horreeya. Waxaa la abuurayaa tenant, doorka Owner, iyo 9 system roles.
3. **Dashboard** — tirada laamaha, bakhaarada, xubnaha.
4. **Dejinta ganacsiga** — magac, lacag, low-stock toggle, quiet hours (goobaha aamusnaanta waa diyaar Weji 5, ma shaqeeyaan).
5. **Kooxda** — liiska xubnaha, martiqaad (link la nuqulay; email lama diro), ka saarid.
6. **Doorarka** — liis read-only. API-ga wuxuu oggol yahay abuurista/beddelka doorarka; UI ma sameeyo.
7. **Laamo & bakhaaro** — abuur, beddel, kaydi (archive), default flag.
8. **Luqad** — English iyo Soomaali (`next-intl`), language switcher.

Bogagga web: `/`, `/login`, `/register`, `/onboarding`, `/dashboard`, `/settings`, `/settings/team`, `/settings/roles`, `/settings/locations`.

### 3.2 API-yada shaqeeya (`/api/v1`)

| Qayb | Endpoints |
|------|-----------|
| Health | `GET /health` |
| Auth | `POST /auth/register`, `/login`, `/logout`, `/refresh`; `GET /auth/me`; `POST /auth/switch-business`; `POST /auth/invitations/accept` |
| Ganacsi | `POST /businesses`; `GET\|PATCH /businesses/current`; `GET\|PATCH /businesses/current/settings` |
| Users | `GET /users`; `POST /users/invite`; `PATCH\|DELETE /users/:id`; `GET /invitations/:token` |
| RBAC | `GET\|POST /roles`; `PATCH /roles/:id`; `GET /permissions` |
| Goobaha | `GET\|POST /branches`; `PATCH /branches/:id`; `GET\|POST /warehouses`; `PATCH /warehouses/:id` |

Tenant identity mar walba waxay ka timaadaa session-ka, **waligeed** `businessId` kama yimaado jidhka request-ka.

### 3.3 Database (Prisma) — 13 model

`User`, `Session`, `Business`, `BusinessSettings`, `Permission`, `Role`, `RolePermission`, `Membership`, `Invitation`, `Branch`, `Warehouse`, `AuditLog`.

Hal migration: `prisma/migrations/20260919203106_phase1_foundation/`.

### 3.4 RBAC

9 door default: Owner, Admin, Manager, Accountant, Cashier, Sales Staff, Inventory Manager, Warehouse Staff, Viewer.

23 permission keys ayaa la beerayaa (sales, inventory, customers, debts, …) inkasta oo inta badan **aan weli lahayn** API u dhigma. Server-side `requirePermission` ayaa ku dhaqma routes-ka Weji 1.

### 3.5 Stack dhabta ah

| Lakab | Technology |
|-------|------------|
| Web | Next.js 16, React 19, Tailwind 4, shadcn-style UI, TanStack Query, next-intl, React Hook Form, Zod |
| API | Express, TypeScript, Prisma 6, argon2, jose, helmet, CORS allowlist |
| Data | PostgreSQL 16 |
| Jobs | Worker stub; Redis 7 Docker waa la keenay |
| Monorepo | pnpm + Turborepo |
| Packages | `database`, `validation`, `types`, `config` |

---

## 4. Wixii aan weli dhisnayn

Blueprint-ka (`docs/03-Database/data-model.md`, `docs/04-API/api-blueprint.md`) wuxuu qeexayaa:

**Ma jiraan tables ama routes:** Product, Category, Variant, Stock, StockMovement, Customer, CustomerDebt, Sale, Invoice, Payment, Supplier, Purchase, Expense, AutomationRule, Notification, Plan, Subscription, Super Admin.

**API blueprint vs koodhka:** qaybaha Products, Inventory, Sales/POS, Customers, Debts, Purchases, Reports, Automation, Notifications, Super Admin dhammaantood waa dukumenti kaliya.

**UX flows aan la dhammayn:** qorshe (plan), soo dejinta alaabta/macaamiisha, isku xirka WhatsApp, iibka credit, qorista lacagta, wareejinta stock.

**Architecture doc vs repo:** `packages/ui`, `packages/auth`, iyo `tests/` (E2E) waa la qoray dukumentiga, **ma jiraan** workspace-ka.

---

## 5. Tayo, amni, iyo tijaabo

### 5.1 Tijaabooyin

Hal fayl: `apps/api/src/__tests__/auth-tenant.test.ts` (Vitest + Supertest, DB dhab ah).

Wuxuu xaqiijiyaa:

1. `GET /businesses/current` aan auth lahayn → 401.
2. Register → logout → login → `/auth/me`.
3. Labo tenant: PATCH branch-ka kan kale → 404; magaca kama beddelmo (ka hortagga IDOR).

**Aan la tijaabin:** 403 RBAC, martiqaad, roles CRUD, warehouses, refresh rotation, rate limit, settings, audit log. Web-ka ma lahan test script. E2E ma jiro.

### 5.2 Checklist amni (`docs/09-Security`)

| Shuruud | Xaalad |
|---------|--------|
| Password hashing (argon2id) | Haa |
| HttpOnly cookies + refresh rotation | Haa |
| Login rate limit | Qayb — register/login kaliya |
| Account lockout | Maya |
| Server-side RBAC + tenant scope | Haa |
| IDOR ka hortag (laamo) | Haa, tijaabo jirta |
| Super Admin vs business admin | Maya |
| Zod validation | Haa (services); `validate` middleware lama isticmaalin |
| CORS, helmet, 1mb JSON limit | Haa |
| Email verification | Maya (`emailVerifiedAt` waa field madhan) |
| Audit log write | Haa; **akhri API/UI ma jiro** |
| Structured logs / error monitoring | Maya |
| PostgreSQL backups, queue monitoring | Maya |
| CI/CD, rollback | Maya |

### 5.3 GitHub / delivery

- Commits: 2, labadaba 19 Sebtembar 2026, Cursor co-author.
- Issues: 0. PRs: 0. Actions workflows: 0.
- Visibility: **public**.
- Seed: permission catalog kaliya; demo user/business ma jiro.

---

## 6. Khataro iyo daldaloolo (sida ugu muhiimsan)

1. **Dashboard vs RBAC.** Dashboard wuxuu u yeedhaa `/branches`, `/warehouses`, `/users` kuwaas oo u baahan `settings.manage` / `users.manage`. Cashier iyo viewer waxay arki karaan 403 halkii ay ka ahaan lahaayeen dashboard ammaan ah.
2. **Nav-ka UI ma xirna ogolaanshaha.** Dhammaan xiriirada shell-ka waa muuqda; amni waa server-side, laakiin UX waa marin khaldan.
3. **Martiqaadka ma diro email.** Token caddaan ah ayaa ku soo noqda API-ga; waa in gacanta lagu wadaago. Ma jiro revoke UI; expiry waa la xaqiijiyaa marka la isticmaalo.
4. **Onboarding locale waa `en` hardcoded** inkasta oo UI-ga Soomaali yahay.
5. **`switch-business` API waa jira, UI ma jiro.** User-ku wuxuu leeyahay hal ganacsi la leeyahay; ku biirista mid kale waa martiqaad.
6. **Permissions mustaqbalka.** Doorarka cashier/manager waxay sheeganayaan awoodaha iib/alaab/deyn kuwaas oo aan weli jirin.
7. **REDIS_URL waa qasab API env**, API-na Redis ma isticmaalo. Worker-ku BullMQ ma xirna.
8. **Repo public + ma jiro CI** — tijaabooyinka tenant isolation lama ordo si toos ah.
9. **Ma jiro production deploy** (Coolify/VPS/Cloudflare waa qorshe architecture, ma aha setup).

Kuwani ma jebinayaan Weji 1 haddii loo isticmaalo owner/admin kaliya, laakiin waa in la saxo ka hor inta aan la ballaarin koox dhab ah.

---

## 7. Tallaabooyinka xiga (sida loo kordhiyo qiimaha)

Hadafka badeecadda ma aha in Weji 1 la qurxiyo weligiis. Qiimaha ganacsiga wuxuu bilaabmaa **Weji 2 + 3 + 4** (alaab → iib → deyn). Automation (Weji 5) waa kala soocaha, laakiin wuxuu u baahan yahay deyn iyo taariikh dhimasho.

### Marka hore — xidh Weji 1 si ganacsi ah

- CI: `pnpm test` + `pnpm lint` + typecheck ku ordo GitHub Actions.
- UI: qari nav/actions haddii permission maqan tahay; dashboard u dhaqan 403 si nadiif ah.
- Roles page: abuur/beddel door (API horay u jirta).
- Martiqaad: revoke + liiska pending; ha soo celin token logs-ka.
- Hubi in locale onboarding raacdo luqadda UI.

### Kadib — Weji 2 Inventory (qasab ka hor POS)

- Models: Product, Category, Variant, Unit, Stock, StockMovement.
- Qaanuunka aan gudboonayn: **waligeed ha beddelin stock without StockMovement**, transaction PostgreSQL.
- UI: alaabaha, stock, adjustment.

### Kadib — Weji 3–4 Sales + Debt (qalbi badeecadda)

- POS, invoice, payment, credit sale.
- Customer + CustomerDebt + due date.
- Socodka rasmiga ah: Sale → Invoice → Payment → Outstanding → Debt.

### Kadib — Weji 5 Automation

- Beddel worker stub → BullMQ dhab ah.
- Templates WhatsApp/SMS/email, idempotency, quiet hours (goobaha settings-ka horay u jira).
- NotificationLog qasab.

Ha dhisin Super Admin ama billing ka hor inta aan flow-ga iib-deyn-xasuusin shaqayn.

---

## 8. Tixraac farsamo

### 8.1 Qaabdhismeedka koodhka

```text
apps/web          Next.js UI (~1,270 lines TSX/TS)
apps/api          Express API (~1,720 lines) — modules: auth, businesses, users, roles, branches, warehouses
apps/worker       Stub (15 lines)
packages/database Prisma client, RBAC catalog, seed
packages/validation Zod schemas (Weji 1)
packages/types    Shared TS types
packages/config   tsconfig
prisma/           schema + 1 migration
docs/             Blueprint Weji 0–9 + warbixintan
docker/           Postgres 16 + Redis 7
```

~62 fayl TS/TSX, ~3,400 sadar application code (ka reeb `node_modules`).

### 8.2 Local development (sida README)

```bash
pnpm install
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Web: http://localhost:3000  
- API: http://localhost:4000/api/v1  

### 8.3 Commits

| SHA | Taariikh | Fariin |
|-----|----------|--------|
| `c5216d0` | 2026-09-19 | Initial commit: Daljir Phase 1 SaaS foundation with auth, tenancy, and RBAC |
| `f1e5180` | 2026-09-19 | Add product blueprint docs to the repository |

### 8.4 Xeerarka aan gudboonayn (CLAUDE.md) — xaalad

| Xeer | Weji 1 |
|------|--------|
| Multi-tenant isolation | La dhaqmay + tijaabo IDOR |
| Server-side authorization | La dhaqmay routes-ka jira |
| TypeScript strict | Haa |
| Validate external input | Zod services |
| PostgreSQL transactions for financial/inventory | N/A weli (ma jiraan) |
| StockMovement qasab | N/A weli |
| Deyn without invoice | N/A weli |
| Jobs idempotent | Worker stub |
| Notification logs | Ma jiraan |
| Secrets kama jiraan source | `.env.example` placeholders |
| Tests for critical logic | 3 cases auth/tenant |
| API contracts documented | `apps/api/README.md` Weji 1; blueprint waa mustaqbal |

---

## 9. Gunaanad

Project Gaan **si sax ah ayuu uga bilowday**: aasaas SaaS ah (akoonti, kala soocida ganacsiyada, doorar, laamo, luqad labadaba) waa koodh, ma aha slide. Taasi waa Weji 1, waana shaqo dhab ah.

Weli **ma aha** platform-ka loogu talagalay in ganacsiga Soomaaliyeed ku iibiyo, ku deynto, kuna xasuusiyo. Kala soocaha badeecadda — deyn → due date → automation → WhatsApp — waa dukumenti.

**Hal jumlad:** aasaaska waa taagan yahay; alaabta, lacagta, iyo xasuusinta waa in la dhiso xiga, si isku xigta, iyadoo aan la jebin xeerarka tenant iyo transaction.

---

*Warbixin lagu sameeyey audit koodhka `main` 20 Sebtembar 2026. Haddii `main` isbeddelo, cusboonaysii qaybahan 3, 5, iyo 8.*
