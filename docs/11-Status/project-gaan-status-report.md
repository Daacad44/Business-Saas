# Project Gaan — Warbixin Buuxda / Full Status Report

**Taariikhda warbixinta:** 20 Sebtembar 2026  
**Mashruuca:** Daljir Business Platform (Project Gaan)  
**Shirkadda:** Daljir Technology  
**CEO & Founder:** Abdishakur Botan Warsame  
**Repo:** [github.com/Daacad44/Business-Saas](https://github.com/Daacad44/Business-Saas)  
**Laanta:** `main`  
**Heerka hadda:** Phase 1 — SaaS Foundation (dhammaad ku dhow, laakiin ma aha production-ready)

---

## 1. Kooban / Executive Summary

Project Gaan waa aasaaska Daljir Business Platform: SaaS multi-tenant loogu talagalay ganacsiyada (tafaariiq, jumlo, farmashiye, elektaroonig, iwm) si ay u maareeyaan inventory, POS, macaamiil, deyn, iyo xasuusin otomaatig ah.

**Xaaladda guud: Aasaaska waa la dhigay. Alaabta ganacsiga (inventory, POS, deyn, automation) weli lama dhisin.**

| Cabbir | Qiime | Faahfaahin |
| --- | --- | --- |
| Heerka mashruuca | Phase 1 / 9 | Foundation + blueprint; Phase 2–9 weli 0% |
| Phase 0 (docs) | ~95% | PRD, architecture, ERD, API, RBAC, security, standards |
| Phase 1 (SaaS foundation) | ~85% | Auth, tenancy, RBAC, onboarding, branches, warehouses |
| Phase 2–9 (alaabta ganacsiga) | 0% | Products, POS, customers, debts, automation, billing |
| Tijaabooyin (tests) | Hoose | 1 file, 3 API tests; ma jiro E2E, ma jiro CI |
| GitHub ops | Aasaasi | 2 commits, 0 issues, 0 PRs, 0 CI runs |
| Diyaar u ah macaamiil | Maya | Ma jiro stock, iib, invoice, ama deyn |

**Qodobka ugu muhiimsan:** Kala duwanaanshaha alaabta (credit sale → deyn → due date → WhatsApp/SMS reminder) waa la qeexay si fiican dokumentiga, laakiin koodhka weli ma taageero iib, invoice, payment, ama notification.

---

## 2. Maxaa la dhisay? / What exists today

### 2.1 Blueprint (Phase 0) — dhameystiran

Dokumentiga waa mid ganacsi-heer, oo ku yaal `docs/`:

| Fayl | Mawduuc |
| --- | --- |
| `01-Product/PRD.md` | Yoolka alaabta, modules, mabaadi'da |
| `02-Architecture/system-architecture.md` | Monorepo, tenant isolation, transaction boundary |
| `03-Database/data-model.md` | ERD dhammaan domains (inventory ilaa billing) |
| `04-API/api-blueprint.md` | Qorshaha `/api/v1` |
| `05-RBAC/rbac-matrix.md` | 9 door + 23 permission |
| `06-Automation/automation-engine.md` | Trigger → action → log, BullMQ |
| `07-UX-Flows/user-flows.md` | Onboarding, credit sale, payment, inventory |
| `08-Roadmap/development-roadmap.md` | Phase 0–9, MVP ~17–23 toddobaad |
| `09-Security/security-checklist.md` | Auth, API, data, operations |
| `10-Dev-Standards/engineering-standards.md` | TypeScript, transactions, DoD |
| `CLAUDE.md` | 15 xeer oo aan laga gudbi karin |

### 2.2 Software (Phase 1) — shaqeynaya

Monorepo `pnpm` + Turborepo:

```
apps/web          Next.js 16 + React 19 + Tailwind 4 + next-intl
apps/api          Express + Prisma + Zod + Vitest
apps/worker       BullMQ stub (Phase 5)
packages/database Prisma client + RBAC catalog + seed
packages/validation Shared Zod schemas
packages/types    Shared TypeScript types
packages/config   Shared tsconfig
prisma/           Schema + Phase 1 migration
docker/           Postgres 16 + Redis 7
```

**Git:** 2 commits (19 Sebtembar 2026)

1. `c5216d0` — Phase 1 foundation (auth, tenancy, RBAC) — 107 files
2. `f1e5180` — Product blueprint docs — 13 files

---

## 3. Feature scorecard

### Phase 1 — SaaS Foundation

| Feature | API | UI | Tests | Xaalad |
| --- | --- | --- | --- | --- |
| Register / login / logout | Haa | Haa | Haa | ✅ |
| Refresh token rotation | Haa | Rewrite/proxy | Qayb | ✅ |
| Session cookies (httpOnly) | Haa | Haa | Haa | ✅ |
| Auth rate limit | Haa | — | — | ✅ |
| Password hashing (argon2id) | Haa | — | — | ✅ |
| Business onboarding | Haa | Haa | Haa | ✅ |
| Default branch + warehouse | Haa | Haa | Haa | ✅ |
| Tenant isolation (`businessId` server-side) | Haa | — | Haa | ✅ |
| RBAC 9 system roles, 23 permissions | Haa | View | Qayb | ✅ |
| Custom roles (create/update) | Haa | Maya | Maya | ⚠️ API kaliya |
| Team list / invite / remove | Haa | Haa | Maya | ⚠️ Invite = copy-link, ma jiro email |
| Accept invitation | Haa | Register `?invite=` | Maya | ⚠️ |
| Branches CRUD + archive | Haa | Create + archive | Isolation test | ✅ |
| Warehouses CRUD + archive | Haa | Create + archive | Maya | ⚠️ |
| Business settings (currency, quiet hours, low-stock flag) | Haa | Haa | Maya | ✅ |
| Audit log writes | Haa | Maya | Maya | ⚠️ Ma jiro UI / query API |
| Switch business | Haa | Maya | Maya | ⚠️ API kaliya |
| English + Somali UI | — | Haa | — | ✅ |
| Email verification | Maya | Maya | — | ❌ |
| Password reset | Maya | Maya | — | ❌ |
| Account lockout | Maya | Maya | — | ❌ |
| CI/CD | Maya | — | — | ❌ |

### Phase 2–9 — weli lama bilaabin

| Phase | Modules | Xaalad |
| --- | --- | --- |
| 2 Inventory | Products, variants, SKU, barcode, stock, movements, transfers | ❌ Schema iyo API midna ma jiro |
| 3 Sales / POS | POS, invoices, receipts, payments, returns, credit sales | ❌ |
| 4 Customer / Debt | Customers, credit limits, aging, collection | ❌ |
| 5 Automation | BullMQ jobs, templates, WhatsApp/SMS/email | ❌ Worker stub kaliya |
| 6 Purchases | Suppliers, POs, receiving, supplier payments | ❌ |
| 7 Reports | Sales, inventory, debts, profit, exports | ❌ |
| 8 Super Admin & SaaS | Plans, subscriptions, platform analytics | ❌ |
| 9 Hardening | E2E, backups, monitoring, production launch | ❌ |

**Prisma schema hadda:** User, Session, Business, BusinessSettings, Permission, Role, RolePermission, Membership, Invitation, Branch, Warehouse, AuditLog.  
**Ma jiraan:** Product, Stock, Sale, Invoice, Payment, Customer, CustomerDebt, Notification, Subscription.

---

## 4. Socodka isticmaalaha ee shaqeynaya / Working user flow

Hadda qofku wuxuu sameyn karaa:

1. Landing page (EN/SO) → Register ama Login
2. Haddii uu yahay user cusub → Onboarding (magaca ganacsiga, nooca, currency, branch, warehouse)
3. Dashboard: tirada branches, warehouses, xubnaha
4. Settings: magaca, currency, timezone, low-stock flag, quiet hours
5. Team: soo casuun (link la copy-gareeyo), ka saar xubin
6. Roles: eeg 9 system roles iyo permissions (read-only)
7. Locations: ku dar / archive branch iyo warehouse
8. Logout

**Kala duwanaanshaha ugu weyn ee alaabta** (`Sale → Invoice → Payment → Debt → Due Date → Automation → Notification`) **weli ma shaqeyo** — tables iyo endpoints midna ma jiraan.

---

## 5. Architecture iyo amniga / Architecture & security

### Wanaagga la dhisay

- Multi-tenant isolation: `businessId` waxaa laga qaataa session/cookie, **lama aaminiyo** client-supplied id. Test gaar ah ayaa caddeynaya in Tenant B uusan beddeli karin branch-ka Tenant A.
- Server-side RBAC (`requirePermission`) — UI hiding keliya maaha amniga.
- JWT access (15m) + hashed refresh token, rotation marka la refresh-gareeyo, session revoke logout.
- Cookies: `httpOnly`, `sameSite=lax`, `secure` production.
- Helmet, CORS allowlist, JSON 1mb limit, auth rate limit (20 / 15 daqiiqo).
- Zod validation packages-ka la wadaago.
- Argon2id password hashing.
- Audit log writes for register/login/invite/accept.
- Engineering rules (`CLAUDE.md`) waxay ilaalinayaan: tenant isolation, transactions, StockMovement, debt-with-invoice, idempotent jobs.

### Meelaha daciifka ah

| Risk | Saameyn | Faahfaahin |
| --- | --- | --- |
| Ma jiro GitHub Actions | Sare | `main` waxaa la push-gareeyaa iyada oo aan test/lint/typecheck la ormin. |
| 3 tests kaliya | Sare | Roles, invites, warehouses, settings, IDOR kale lama tijaabin. |
| Invite = copy-link | Dhexdhexaad | Token-ka wuxuu ka muuqdaa URL; ma jiro email; Phase 1 waa la ogyahay. |
| Email verification / password reset ma jiraan | Dhexdhexaad | Account-yada waa ACTIVE isla markiiba. |
| Account lockout ma jiro | Dhexdhexaad | Rate limit waa jira, laakiin brute-force per-account ma jiro. |
| Audit logs ma la akhrin karo | Hoose | Waa la qoraa, UI/API ma jiro. |
| Custom roles UI ma jiro | Hoose | API waa jirtaa; UI waa read-only. |
| Dashboard `GET /users` | Hoose | Wuxuu u baahan yahay `users.manage`; cashier/viewer dashboard-ku wuu fashilmi karaa. |
| Onboarding locale hardcoded `en` | Hoose | UI waa bilingual, business locale-ka onboarding waa English. |
| Repo waa public | Dhexdhexaad | Ma jiraan secrets source-ka; weli product-ka waa early. |
| Architecture vs code | Hoose | Docs waxay xusayaan `packages/ui`, `packages/auth`, `tests/` — koodhka kuma jiraan. |
| Worker waa stub | La filayo | Phase 5; Redis waa Docker, jobs lama process-gareeyo. |

---

## 6. Tayada engineering / Engineering quality

| Heer | Xaalad |
| --- | --- |
| TypeScript strict | Haa (base tsconfig) |
| Service-layer (ma aha fat controllers) | Haa — modules: auth, businesses, users, roles, branches, warehouses |
| API contract documented | Phase 1: `apps/api/README.md`. Blueprint dhammaan Phase 2+ waa qorshe. |
| Consistent `{ data, error, meta }` | Haa |
| i18n EN + SO | Haa (`messages/en.json`, `messages/so.json`) |
| Loading / error / retry UI | AuthGate waa jirtaa; qaar ka mid ah pages-ka settings ma muujiyaan empty/error si buuxda |
| E2E | Maya |
| Performance / monitoring | Maya |
| Backups / restore tests | Maya |
| Production deploy | Maya — ma jiro Coolify/Vercel/CI config |

Tijaabada keliya (`apps/api/src/__tests__/auth-tenant.test.ts`):

1. Unauthenticated `GET /businesses/current` → 401
2. Register → logout → login → `/auth/me`
3. Two tenants: Tenant B PATCH branch-ka Tenant A → 404, magaca weli waa "Main"

Tijaabadani waxay u baahan tahay PostgreSQL live; CI ma jiro si loo ordo.

---

## 7. GitHub iyo hawl-maalmeedka / GitHub & operations

| Shay | Xaalad |
| --- | --- |
| Repo created | 19 Sebtembar 2026 |
| Default branch | `main` |
| Visibility | Public |
| Commits on `main` | 2 |
| Open / closed issues | 0 |
| Pull requests | 0 |
| GitHub Actions / CI | 0 workflows, 0 runs |
| Branch protection | Lama arag (PR lama isticmaalin) |
| Engineering standard ("PRs required") | Lama raacin weli — 2 commits toodda `main` |

Tani waa caadi marka mashruucu dhowaan bilaabmay, laakiin **CI iyo issues board waa in la dhiso ka hor Phase 2**.

---

## 8. Isku-xirka qorshaha iyo koodhka / Plan vs code

Roadmap-ku wuxuu qiyaasayaa MVP production-ready **17–23 toddobaad** shaqo diiradda saaran.

Hadda (maalinta 2 ee repo-ga):

```
Phase 0  ████████████████████░  ~95%   docs + standards (CI missing)
Phase 1  ████████████████░░░░░  ~85%   auth/tenancy/RBAC/locations
Phase 2  ░░░░░░░░░░░░░░░░░░░░░   0%    inventory
Phase 3  ░░░░░░░░░░░░░░░░░░░░░   0%    POS / sales
Phase 4  ░░░░░░░░░░░░░░░░░░░░░   0%    customers / debt
Phase 5  ░░░░░░░░░░░░░░░░░░░░░   0%    automation (stub only)
Phase 6  ░░░░░░░░░░░░░░░░░░░░░   0%    purchases
Phase 7  ░░░░░░░░░░░░░░░░░░░░░   0%    reports
Phase 8  ░░░░░░░░░░░░░░░░░░░░░   0%    super admin / billing
Phase 9  ░░░░░░░░░░░░░░░░░░░░░   0%    hardening / launch
```

**Qiyaasta farsamo (ma aha taariikh):** Phase 1 in la xiro (CI, tests, invite polish, role UI) waa shaqo yar. Phase 2 Inventory waa tallaabada xigta ee ugu weyn — schema cusub, stock movements, iyo UI dhan.

---

## 9. Qorshaha la taliyay / Recommended next steps

### A. Xir Phase 1 ka hor intaadan Inventory bilaabin

1. **CI:** GitHub Action — `pnpm lint`, `pnpm test`, typecheck, Prisma validate.
2. **Tests:** Invite accept, role create, warehouse tenant isolation, permission deny (cashier cannot invite).
3. **UI gaps:** Role-ka xubinta beddel, custom role create, dashboard ha jebin haddii `users.manage` maqan yahay.
4. **Onboarding:** `locale` ha raaco luqadda UI-ga, ha ahaan `en` hardcoded.
5. **Issues board:** Phase 2–9 ha noqdaan GitHub issues si loo raaco.

### B. Phase 2 — Inventory (tallaabada xigta ee alaabta)

Sida blueprint-ka:

- Product, Category, Variant, Unit, SKU, barcode
- Stock per warehouse
- **StockMovement waa qasab** (xeerka 6)
- Adjustments + transfers
- Low-stock flag-ka settings-ka hadda waa diyaar, laakiin ma jiro stock si loo xisaabiyo

### C. Ha dhisin Phase 3–5 si isku dhafan

Critical flow-ga waa:

`Sale → Invoice → Payment → Outstanding Balance → Debt → Due Date → Automation → Notification → Payment → Debt Reconciliation`

Inventory waa inuu ka horreeyaa POS. Debt waa inuu ka horreeyaa automation. Ha bilaabin WhatsApp ka hor inta deyn iyo invoice aysan dhaqan gelin.

### D. Amniga iyo hawlgalka

- Ka dhig `main` protected; PRs + CI required.
- Ha gelin secrets source-ka (hadda `.env.example` waa nadiif).
- Password reset + email verification ka hor production.
- Qorshe backup Postgres ka hor macaamiil dhab ah.

---

## 10. Gunaanad / Verdict

**Project Gaan wuxuu ku jiraa xaalad caafimaad qabta ee aasaaska, laakiin weli waa foundation — ma aha alaab ganacsi dhammeystiran.**

Waxa la helay maalmo yar gudahood:

- Qeexitaan cad (PRD, architecture, debt automation, RBAC)
- Koodh shaqeynaya: auth, multi-tenancy, roles, branches, warehouses, bilingual UI
- Tenant isolation tijaabo ah
- Xeerarka engineering ee aan laga gudbi karin

Waxa u baahan diiradda xiga:

- CI + tijaabooyin dheeraad
- Phase 1 polish (roles UI, invite email later, dashboard permissions)
- **Phase 2 Inventory** — tallaabada ugu muhiimsan ee alaabta

Ilaa inventory, POS, iyo debt-ku shaqeeyaan, Daljir weli ma iibin karo qiimaha kala duwan ee loo qorsheeyay (deyn + xasuusin otomaatig ah). Aasaaska inuu sax yahay waa muhiim — ha degdegin Phase 5 (WhatsApp) ka hor inta xisaabaadka iyo stock-ku aysan adkeyn.

---

*Warbixintan waxaa lagu saleeyay koodhka `main` (commit `f1e5180`), dokumentiga `docs/`, Prisma schema, API modules, web routes, iyo xaaladda GitHub 20 Sebtembar 2026. Ma jiraan issues, PRs, ama CI runs wakhtigaas.*
