# Firebase Auth Emulator - Seed Data

Scripts for seeding test users into the Firebase Auth emulator for local
development.

## Prerequisites

The Firebase Auth emulator must be running on `localhost:9099`. Start it
from the repo root:

```bash
docker compose -f docker-compose.firebase-emulator.yml up -d
# or
pnpm --filter api firebase:emulator:start
```

Wait 30-60 seconds and verify:

```bash
curl http://localhost:9099
# {"state":"running","projectState":"ACTIVE"}
```

## Usage

`scripts/firebase-seed/seed-users.ts` creates test users with different
roles. Set the emulator host and run:

```bash
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 pnpm exec tsx scripts/firebase-seed/seed-users.ts
```

Optional flags:

| Flag       | Purpose                          |
| ---------- | -------------------------------- |
| `--list`   | List existing users in emulator  |
| `--cleanup`| Delete all users (cleanup)        |

```bash
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 pnpm exec tsx scripts/firebase-seed/seed-users.ts --list
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 pnpm exec tsx scripts/firebase-seed/seed-users.ts --cleanup
```

## Seeded Users

| Email                    | Password        | Roles     | Permissions                           | Status     |
| ------------------------ | --------------- | --------- | ------------------------------------- | ---------- |
| admin@example.local      | Admin123!       | admin     | read:all, write:all, delete:all       | Active     |
| user@example.local       | User123!        | user      | read:own, write:own                   | Active     |
| moderator@example.local  | Mod123!         | moderator | read:all, write:all, moderate:content | Active     |
| unverified@example.local | Unverified123!  | -         | -                                     | Unverified |
| disabled@example.local   | Disabled123!    | -         | -                                     | Disabled   |

## Adding Custom Seed Scripts

Follow the pattern in `seed-users.ts`:

```typescript
import admin from 'firebase-admin';

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
}

const app = admin.initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID ?? 'demo-mivialabs-project'
});

const auth = app.auth();

const user = await auth.createUser({
  email: 'test@example.com',
  password: 'password123',
  displayName: 'Test User',
  emailVerified: true
});

await auth.setCustomUserClaims(user.uid, {
  roles: ['admin'],
  permissions: ['read:all'],
  tenantId: 'default'
});

await app.delete();
```

## Optional npm Scripts

Add these to the root `package.json` for convenience:

```json
{
  "scripts": {
    "seed:firebase:users": "FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 pnpm exec tsx scripts/firebase-seed/seed-users.ts",
    "seed:firebase:list": "FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 pnpm exec tsx scripts/firebase-seed/seed-users.ts --list",
    "seed:firebase:cleanup": "FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 pnpm exec tsx scripts/firebase-seed/seed-users.ts --cleanup"
  }
}
```

## Best Practices

1. Always set `FIREBASE_AUTH_EMULATOR_HOST=localhost:9099` before invoking the script.
2. Use the demo project id `demo-mivialabs-project` for local development.
3. Run `--cleanup` between test runs to avoid conflicts with stale users.
4. Use consistent seed data for reproducible tests.
5. Never commit real production user data.

## Troubleshooting

### Connection refused

Emulator is not running. Start it and wait 30-60 seconds before retrying.

### User already exists

The script updates custom claims on existing users. Run `--cleanup` first
to start from an empty emulator:

```bash
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 pnpm exec tsx scripts/firebase-seed/seed-users.ts --cleanup
```

### Custom claims not working

Inspect the user's claims directly:

```typescript
import admin from 'firebase-admin';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

const app = admin.initializeApp({ projectId: 'demo-mivialabs-project' });
const user = await app.auth().getUserByEmail('admin@example.local');
console.log('Custom claims:', user.customClaims);
```

## Related Files

- `docker-compose.firebase-emulator.yml` — Firebase emulator stack
- `packages/auth/` — Authentication package