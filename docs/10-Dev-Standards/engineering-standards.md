# Engineering Standards

## General
- TypeScript strict mode
- No business logic in UI components
- Service-layer business logic
- Repository/data-access abstraction where useful
- Consistent error format
- Consistent API response format
- Database migrations are version-controlled

## Financial / Inventory
- Use database transactions
- Never silently mutate stock
- Every stock change creates a movement
- Every payment creates a financial record
- Payment allocation must be explicit
- Debt balance must be derived from immutable transaction history where practical

## Background Jobs
- Jobs must be idempotent
- Retries must be safe
- Record execution state
- Handle permanent failures
- Do not send duplicate customer messages

## Git
- feature/*
- fix/*
- refactor/*
- chore/*
- Conventional commits
- Pull requests required for production branches

## Definition of Done
A feature is not done until:
- API implemented
- UI implemented
- Authorization implemented
- Validation implemented
- Audit/event behavior implemented where needed
- Tests added
- Error states handled
- Loading/empty states handled
- Documentation updated
