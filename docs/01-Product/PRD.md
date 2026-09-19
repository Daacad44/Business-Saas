# Product Requirements Document

## 1. Product
Daljir Business Platform

## 2. Target Customers
Retailers, wholesalers, supermarkets, pharmacies, electronics shops, clothing businesses, hardware stores, mobile shops, auto-parts businesses and general trading companies.

## 3. Core Modules
- Authentication
- Business onboarding
- Multi-tenancy
- Users, roles and permissions
- Branches and warehouses
- Products, categories, variants and units
- Inventory and stock movements
- POS and sales
- Customers
- Invoices and receipts
- Payments
- Customer credit/debt
- Suppliers
- Purchases
- Expenses
- Notifications
- Automation
- Reports and analytics
- Audit logs
- Super Admin
- SaaS plans and subscriptions

## 4. Debt Automation
A credit sale creates an invoice and outstanding balance. The debt engine records the due date. A scheduler creates jobs for configured reminders.

Example:
- 7 days before due date
- 3 days before
- 1 day before
- Due today
- 1 day overdue
- 3 days overdue
- 7 days overdue

Channels:
- WhatsApp
- SMS
- Email
- In-app

## 5. Product Principles
- Every feature must map to a real business workflow.
- Financial and inventory mutations must be transactional.
- Server-side authorization is mandatory.
- Every important mutation is auditable.
- Tenant isolation must be enforced server-side.
- Background jobs must be idempotent and retryable.
