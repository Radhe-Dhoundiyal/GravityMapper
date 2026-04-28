# ENVIRONMENT_NOTES

This file documents the local development and deployment environment expected by future AI coding sessions.

## Environment Details

- Node.js version: v24
- npm version: v11
- Development workflow: Codex + local Git + Render deployment
- Historical note: this project previously used Replit, but Replit-specific development artifacts have been removed.

Use `npm.cmd` from PowerShell if `npm` is blocked by PowerShell execution policy.

## Build System

- Frontend: Vite build -> `dist/public`
- Backend bundle: esbuild -> `dist/index.js`
- Backend source entrypoint: `app/server/index.ts`

Current package scripts:

```bash
npm run build
npm run start
```

`npm run build` runs:

```bash
vite build && esbuild app/server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
```

`npm run start` runs:

```bash
NODE_ENV=production node dist/index.js
```

Important: the root `npm run dev` script currently points to `server/index.ts`, which does not match the current repo layout. For development, use:

```bash
NODE_ENV=development tsx app/server/index.ts
```

## Deployment

- Hosting platform: Render
- `render.yaml` defines `buildCommand` and `startCommand`
- Render installs dev dependencies before running the build
- Current Render build command:

```bash
npm ci --include=dev
npm run build
```

- Current Render start command:

```bash
npm run start
```

Render deployment should produce and serve:

- Frontend assets from `dist/public`
- Backend entrypoint from `dist/index.js`

The Express process serves `/api/*`, `/ws`, and the built frontend from the same Node process.

## Local Development Workflow

1. Install dependencies:

```bash
npm install
```

2. Build:

```bash
npm run build
```

3. Start production-style server:

```bash
npm run start
```

4. Start development server directly:

```bash
NODE_ENV=development tsx app/server/index.ts
```

On Windows PowerShell, prefix environment variables with `$env:` when running manually:

```powershell
$env:NODE_ENV='development'; npx tsx app/server/index.ts
```

## Verification Workflow

- Codex may not be able to run full builds in its sandbox because Vite/esbuild needs to spawn subprocesses.
- If sandboxed build execution fails with a spawn or permission error, rerun with the appropriate tool escalation if permitted.
- If runtime verification cannot be executed, request manual verification from the user.
- Do not claim runtime verification passed without either:
  - successful `npm run build` execution, or
  - user confirmation.

Suggested verification sequence:

```bash
npm run build
```

Then confirm these files exist:

```text
dist/public/index.html
dist/index.js
```

Optional production smoke test:

```bash
NODE_ENV=production PORT=5000 node dist/index.js
```

Then check:

```text
http://localhost:5000/api/health
http://localhost:5000/
```

Known caveat: local Windows production start may fail with `listen ENOTSUP 0.0.0.0:<port>` because of the current server listen configuration. If that occurs, do not treat it as a Render failure without testing on a Linux-like environment or Render itself.
