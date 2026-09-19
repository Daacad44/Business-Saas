# Daljir Technology — Business Management SaaS Blueprint

**Company:** Daljir Technology  
**Product:** Daljir Business Platform / Daljir Inventory  
**CEO & Founder:** Abdishakur Botan Warsame  
**Company Tagline:** Creating what moves you forward

## Product Vision
A commercial-grade multi-tenant SaaS platform for businesses to manage inventory, POS, sales, purchases, customers, credit/debt, payments, suppliers, expenses, branches, reporting and automated customer notifications.

## Core Differentiator
Credit sales automatically become debt records with due dates. The automation engine can schedule WhatsApp/SMS/email reminders before, on, and after the due date.

## Recommended Stack
- Frontend: Next.js, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, React Hook Form, Zod
- Backend: Node.js, Express.js, TypeScript
- Data: PostgreSQL, Prisma
- Jobs: Redis + BullMQ
- Infrastructure: Docker, Coolify, VPS, Cloudflare, object storage
- Architecture: Multi-tenant SaaS with strict tenant isolation

## Primary Build Order
1. Architecture & product specification
2. Multi-tenancy
3. Authentication + RBAC
4. Business / Branch / Warehouse
5. Product + Inventory
6. Sales + POS
7. Customers + Invoices
8. Payments
9. Debt engine
10. Automation engine
11. WhatsApp notifications
12. Purchases + Suppliers
13. Reports + Analytics
14. Super Admin
15. SaaS billing
16. Security, testing and production hardening
