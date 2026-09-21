# Platform super-admin bootstrap

This is an **operator shell command**, not part of API startup. The API process
does not read these variables when it boots and must not be given them as
ordinary application config. The password must **never** be committed to git,
checked into `.env` / `.env.example`, baked into a Docker image, or pasted into
docs. Set the two variables in the operator's shell (or as Coolify runtime
secrets used only for this one-shot command).

## Command

From the monorepo root:

```bash
export ADMIN_BOOTSTRAP_EMAIL="operator@example.com"
export ADMIN_BOOTSTRAP_PASSWORD="set-in-shell"
pnpm admin:bootstrap
```

Equivalent from the API package:

```bash
pnpm --filter @daljir/api admin:bootstrap
```

Inside the API container (Coolify image `WORKDIR` is `/app/apps/api`), after
`ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` are set as runtime
secrets:

```bash
pnpm admin:bootstrap
```

Then unset the password from the shell:

```bash
unset ADMIN_BOOTSTRAP_PASSWORD
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `ADMIN_BOOTSTRAP_EMAIL` | yes | Email of the platform super-admin account. Validated with the same Zod email rule as registration (`trim`, email format, lowercased). |
| `ADMIN_BOOTSTRAP_PASSWORD` | yes | Password for that account. Validated with the same Zod password rule as registration (`min(10)`, `max(128)`). Never commit this value. Use `set-in-shell`. |

If either variable is missing or empty, the command exits non-zero with a clear
message and writes nothing.

If validation fails, the command prints the exact Zod issue (for example
`password: String must contain at least 10 character(s)`), exits non-zero, and
does not create or update a user. Do not loosen the registration password
policy to make a chosen password pass.

## Behavior

- Uses the existing Argon2id hasher (`apps/api/src/lib/password.ts`) and
  `PlatformRole.SUPER_ADMIN`. It does not add a second auth path and does not
  change `requirePlatformAdmin`.
- Runs inside a PostgreSQL transaction.
- **Create:** if no user with that email exists, creates one with
  `platformRole = SUPER_ADMIN`, `status = ACTIVE`, and the hashed password. No
  business, membership, or demo data is created.
- **Update:** if the user exists, sets `platformRole = SUPER_ADMIN`, replaces
  the password hash with a hash of the env password, and ensures `status =
  ACTIVE`. Other users are not read or written.
- **Idempotent:** running it twice leaves exactly one user with that email,
  still `SUPER_ADMIN`.
- Logs the email, role, and status only. It never logs the password or the
  password hash.

`DATABASE_URL` must point at the target database (the API container already
has this). The bootstrap command does not invent a connection string.
