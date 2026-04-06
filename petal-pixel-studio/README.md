# Petal Pixel Studio

Frontend application for procedural flower creation, auth, and NFT mint flow.

Built with React + TypeScript + Vite and integrated with:

- Supabase (auth and data)
- Flower gRPC backend (generation and mint preparation)
- Wallet-based mint confirmation flow

## Features

- Interactive flower creation UI
- Supabase authentication (email/password, OAuth, OTP)
- gRPC-web integration with FlowerService
- NFT mint flow: prepare metadata, execute contract tx, confirm mint

## Tech stack

- React 18 + TypeScript
- Vite
- Tailwind + shadcn/ui + Radix UI
- Zustand + TanStack Query
- Supabase JavaScript SDK
- Vitest + Playwright

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Set values in .env:

- VITE_SUPABASE_PROJECT_ID (optional if URL is set)
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY
- VITE_FLOWER_BACKEND_URL (example: http://localhost:50051)

### 3. Start development server

```bash
npm run dev
```

## Scripts

- npm run dev: start dev server
- npm run build: production build
- npm run preview: preview built app
- npm run lint: run ESLint
- npm run test: run unit tests
- npm run test:watch: watch mode tests

## gRPC client codegen

When proto files change in backend:

1. Open flower-backend.
2. Run:

```bash
buf generate --template buf.gen.frontend.yaml
```

Generated client files are used in src/gen.

## Security notes

- Do not commit .env with real values.
- Frontend must use only publishable Supabase key (never service role key).
- Rotate tokens and API keys after accidental exposure.
- Keep dependency updates active (Dependabot is configured).

## License

Add your preferred license before publishing.
