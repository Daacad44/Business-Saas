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
