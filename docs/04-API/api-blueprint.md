# API Blueprint

Base: `/api/v1`

## Auth
POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/refresh
GET  /auth/me

## Businesses
GET /businesses/current
PATCH /businesses/current
GET /businesses/current/settings
PATCH /businesses/current/settings

## Users & RBAC
GET /users
POST /users/invite
PATCH /users/:id
DELETE /users/:id
GET /roles
POST /roles
PATCH /roles/:id
GET /permissions

## Products
GET /products
POST /products
GET /products/:id
PATCH /products/:id
DELETE /products/:id
POST /products/import

## Inventory
GET /inventory
GET /inventory/movements
POST /inventory/adjustments
POST /inventory/transfers
POST /inventory/transfers/:id/receive

## Sales / POS
POST /sales
GET /sales
GET /sales/:id
POST /sales/:id/return
POST /sales/:id/payment

## Customers
GET /customers
POST /customers
GET /customers/:id
PATCH /customers/:id
GET /customers/:id/sales
GET /customers/:id/debts
GET /customers/:id/debts?status=OVERDUE|DUE_TODAY|PENDING|PARTIALLY_PAID|PAID|CANCELLED
GET /customers/:id/payments

## Debts
GET /debts
GET /debts?status=OVERDUE|DUE_TODAY|PENDING|PARTIALLY_PAID|PAID|CANCELLED
GET /debts?overdueOnly=true
GET /debts/overdue
GET /debts/due-today
GET /debts/aging
GET /debts/:id
POST /debts/:id/payments
POST /debts/:id/remind

Overdue and due-today are **derived** from `dueDate` + `Business.timezone`
+ a positive outstanding balance. `DebtStatus.OVERDUE` / `DUE_SOON` /
`DUE_TODAY` are retained in the schema but are never written and must
not be read as a source of truth. Query `status=OVERDUE` and
`status=DUE_TODAY` are aliases for those live predicates;
`status=DUE_SOON` is rejected with 422. See
[transactional-invariants.md](./transactional-invariants.md).

## Purchases
GET /suppliers
POST /suppliers
GET /purchases
POST /purchases
POST /purchases/:id/receive

## Reports
GET /reports/sales
GET /reports/inventory
GET /reports/debts
GET /reports/customers
GET /reports/financial

## Automation
GET /automation/rules
POST /automation/rules
PATCH /automation/rules/:id
POST /automation/rules/:id/test
GET /automation/executions

## Notifications
GET /notifications
GET /notifications/templates
POST /notifications/templates
GET /notifications/logs

## Super Admin
GET /admin/businesses
GET /admin/users
GET /admin/subscriptions
GET /admin/system-health
GET /admin/audit-logs
