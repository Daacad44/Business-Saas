# Security Checklist

## Authentication
- Secure password hashing
- Secure sessions/tokens
- Refresh-token rotation where applicable
- Login rate limiting
- Account lockout/abuse controls

## Authorization
- Server-side RBAC
- Tenant scoping
- Object-level authorization
- Prevent IDOR
- Separate platform and business admin scopes

## API
- Input validation with Zod or equivalent
- Rate limiting
- CORS allowlist
- Secure headers
- Request size limits
- Webhook signature verification

## Data
- PostgreSQL backups
- Encryption in transit
- Secrets stored outside source control
- Least-privilege database access
- Audit logs

## Operations
- Error monitoring
- Structured logs
- Health checks
- Queue monitoring
- Backup restore tests
- Deployment rollback procedure
