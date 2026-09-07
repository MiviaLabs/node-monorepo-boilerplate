# Mobile app (`apps/mobile`)

Expo (SDK 54) + expo-router React Native app in TypeScript, wired into the Nx/pnpm workspace like the other apps under `apps/`.

## Structure

```
apps/mobile/
├── app/
│   ├── _layout.tsx        # Root stack + Auth/I18n providers
│   ├── index.tsx          # Session-based redirect (login ↔ settings)
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   └── login.tsx      # Mocked login screen
│   ├── settings.tsx       # Settings screen (locale switcher, logout)
│   └── lib/
│       ├── storage.ts           # Typed JSON storage (driver seam)
│       ├── storage-driver.ts    # AsyncStorage driver (default)
│       ├── storage.test-drivers.ts  # In-memory driver for tests
│       ├── i18n.ts              # en/de dictionaries, fallback, persistence
│       ├── i18n-context.tsx     # I18nProvider / useI18n
│       ├── auth.ts              # Pure mocked auth (createAuth, validateCredentials)
│       ├── auth-context.tsx     # AuthProvider / useAuth
│       └── *.test.ts            # Vitest unit tests (pure logic only)
├── app.json               # Expo config
├── metro.config.js        # Monorepo-aware Metro (watchFolders + pnpm nodeModulesPaths)
├── babel.config.js        # babel-preset-expo
├── vitest.config.ts
└── project.json           # Nx targets: start / lint / typecheck / test
```

## Conventions

- **Testability first**: all business logic (storage, i18n, auth) is pure TypeScript with injectable seams. React Native modules (AsyncStorage, expo-router) are never imported by code under test; screens stay thin.
- **i18n**: every user-facing string is a dictionary key. `en` is complete; `de` may be partial — missing keys fall back to `en`. Locale is persisted through the storage wrapper.
- **Auth is mocked**: `login()` validates email format + non-empty password and returns a fake session persisted locally. Replace `app/lib/auth.ts` + `auth-context.tsx` internals with the real provider (e.g. `packages/auth`) when backend integration begins; the screens should not need to change.
- **TypeScript**: extends the strict root `tsconfig.base.json`.
- **Commits**: conventional commits (`feat(mobile): ...`).

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev:mobile` | Start Expo dev server |
| `nx typecheck mobile` | TypeScript check |
| `nx test mobile` | Vitest unit tests (Node, no RN runtime) |
| `nx lint mobile` | ESLint |
| `npx expo-doctor --cwd apps/mobile` | Dependency health check |

## Notes & limitations

- The unit test suite deliberately does not cover RN component rendering. For component tests, add `jest-expo` + `@testing-library/react-native` later.
- Async-storage versions must be SDK-pinned (installed the way `npx expo install` would pin them), not bare semver ranges.
