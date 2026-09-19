# Daljir API

Base path: `/api/v1`

Response shape:

```json
{ "data": {}, "error": null, "meta": {} }
```

Errors:

```json
{ "data": null, "error": { "code": "UNAUTHORIZED", "message": "..." } }
```

## Auth
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `GET /auth/me`
- `POST /auth/switch-business`
- `POST /auth/invitations/accept`

## Business
- `POST /businesses` onboarding
- `GET|PATCH /businesses/current`
- `GET|PATCH /businesses/current/settings`

## Users and RBAC
- `GET /users`
- `POST /users/invite`
- `PATCH|DELETE /users/:id`
- `GET /invitations/:token`
- `GET|POST /roles`
- `PATCH /roles/:id`
- `GET /permissions`

## Locations
- `GET|POST /branches`
- `PATCH /branches/:id`
- `GET|POST /warehouses`
- `PATCH /warehouses/:id`

Tenant identity always comes from the authenticated session, never from a client-supplied `businessId`.
