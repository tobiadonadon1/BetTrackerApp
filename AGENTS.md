# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

BETRA is an Expo SDK 54 / React Native sports betting tracker app. It runs on web via `npx expo start --web --port 8082 --clear`. The backend is a remote hosted Supabase instance (no local DB needed). See `package.json` for npm scripts and `app.json` for Expo configuration.

### Running the dev server

```bash
npx expo start --web --port 8082 --clear
```

The app is accessible at `http://localhost:8082`. Metro bundler typically takes ~5s to bundle.

### Lint / Type checking

No ESLint is configured. Use TypeScript for type checking:

```bash
npx tsc --noEmit
```

There are pre-existing TS errors in `BetDetailScreen.tsx`, `LoginScreen.tsx`, and `SettingsScreen.tsx`. These do not block the app from running (Expo/Metro transpiles without strict checking).

### Testing

Detox is listed as a devDependency for e2e tests but has minimal configuration. No unit test framework (Jest) is set up.

### Known issues

- **Signup is broken on the remote Supabase instance.** The `handle_new_user` trigger on `auth.users` (created by `scripts/disable-email-confirm.js`) causes a 500 error during signup. The trigger likely references a column (`confirmed_at`) that doesn't exist in the current Supabase auth schema version. This is a remote backend configuration issue, not a local dev environment problem.
- The `outlineStyle: 'none'` web-only style in `LoginScreen.tsx` causes TS errors because the React Native type definitions don't include web-specific CSS properties.

### Supabase connection

The app uses hardcoded fallback credentials for the remote Supabase project in `src/config/supabase.ts`. No `.env` file is required for basic dev, but you can create one from `.env.example` to override defaults. The service role key is in `scripts/setup-db.js` (for DB admin tasks only).
