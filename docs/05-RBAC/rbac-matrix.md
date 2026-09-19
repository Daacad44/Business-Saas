# RBAC Blueprint

## Default Roles
- Owner
- Admin
- Manager
- Accountant
- Cashier
- Sales Staff
- Inventory Manager
- Warehouse Staff
- Viewer

## Permission Families
sales.create
sales.read
sales.update
sales.delete
inventory.create
inventory.read
inventory.adjust
inventory.transfer
customers.create
customers.read
customers.update
debts.read
debts.collect
debts.remind
purchases.create
purchases.read
reports.read
expenses.create
expenses.read
users.invite
users.manage
settings.manage
automation.manage

## Rules
1. Permissions are checked on the server.
2. UI hiding is not security.
3. Role assignment is tenant-scoped.
4. Owner has full business control.
5. Super Admin permissions are platform-scoped and separate from business roles.
