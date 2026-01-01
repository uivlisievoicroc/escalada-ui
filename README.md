# Escalada Frontend (React + Vite)

Frontend UI for the Escalada real-time climbing competition system.

## Quick Start

```bash
npm install
npm run dev
```

## Tests

```bash
npm test -- --run
# E2E
npx playwright test --reporter=list
```

## Formatting & Hooks

- Frontend formatting is enforced with Prettier via Husky + lint-staged.
- On commit, staged files in `src/` are automatically formatted.

Manual format:

```bash
npm run format
```

Backend API se rulează separat (repo `escalada-api`) dacă ai nevoie de live WS/HTTP.
