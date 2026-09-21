# Database Blueprint

## Identity
User
Role
Permission
RolePermission
Membership
Invitation
Session

## Business
Business
BusinessSettings
Branch
Warehouse

## Inventory
Product
Category
ProductVariant
Unit
Stock
StockMovement
StockAdjustment
StockTransfer
Batch

## Customers & Credit
Customer
CustomerAddress
CustomerNote
CustomerDebt
DebtPayment

## Sales
Sale
SaleItem
Invoice
InvoiceItem
Payment
PaymentAllocation
SalesReturn
SalesReturnItem

## Purchases
Supplier
PurchaseOrder
Purchase
PurchaseItem
SupplierPayment
PurchaseReturn

## Finance
Expense
ExpenseCategory
CashAccount
FinancialTransaction

## Automation & Messaging
AutomationRule
AutomationTrigger
AutomationAction
AutomationExecution
ScheduledJob
Notification
NotificationTemplate
NotificationLog
WhatsAppMessage
SMSMessage
EmailMessage

## Platform
AuditLog
ActivityLog
SystemSetting
WebhookEvent
Subscription
Plan
PlanFeature
Usage

## Critical Relationships

```text
Business
  -> Membership
  -> Branch
  -> Warehouse
  -> Product
  -> Customer
  -> Supplier
  -> Sale
  -> Purchase
  -> Expense

Sale
  -> SaleItem
  -> Invoice
  -> Payment
  -> PaymentAllocation
  -> CustomerDebt (if credit)

CustomerDebt
  -> DebtPayment
  -> AutomationExecution
  -> NotificationLog
```

## Permission catalog (reference data)

`Permission` is global reference data, not a tenant table. Schema migrations do **not** insert catalog rows. A migrated-but-unseeded database leaves `Permission` empty, so `provisionBusinessRoles` creates Owner/Admin with zero `RolePermission` rows and every `requirePermission()` route returns 403.

Production applies the catalog with `pnpm db:sync-reference` (also chained from `pnpm db:migrate:deploy` and from API process startup). The sync upserts by `Permission.key`, never deletes `Permission` or `RolePermission` rows, and leaves unknown keys in place. System role templates stay in `packages/database/src/rbac.ts` and are instantiated per business at onboard.

Demo/sample tenant rows are a separate, dev-only command (`pnpm db:seed:demo`) and must not run in production. See `docs/03-Database/reference-data.md`.
