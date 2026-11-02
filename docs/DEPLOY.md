# Hosting

The public site runs on free tiers. Local Docker stays the way to develop and test.

| Part | Where | Address |
| --- | --- | --- |
| Frontend | Vercel project `petal-pixel` (root `petal-pixel-studio`) | https://petal.bexultan.dev |
| Backend | Vercel project `petal-pixel-api` (root `flower-backend`, Go preset) | https://petal-api.bexultan.dev |
| Database and sign-in | Neon project `silent-base-14125281`, managed through the Vercel marketplace | |
| DNS | Cloudflare zone `bexultan.dev`, CNAME records with the proxy off | |

`bexultan.dev` itself, `www`, `timetable` and `lab` are other sites. Leave those records alone.

## Deploy

```bash
cd petal-pixel-studio && vercel deploy --prod
```

```bash
cd flower-backend && vercel deploy --prod
```

Migrations do not run on Vercel. Apply them from Docker with `DB_DSN` set to `NEON_DATABASE_URL_UNPOOLED` and `DB_AUTO_MIGRATE=true`.

## Sign-in

- The site signs in with Managed Better Auth. Local Docker and the e2e tests use Keycloak, so they need no network. `VITE_NEON_AUTH_URL` picks the provider.
- `api/auth-proxy.ts` carries sign-in through our own domain, so Safari treats the session cookie as first-party. A Vercel rewrite cannot do this: it adds `X-Forwarded-Host`, and the auth service answers `INVALID_HOSTNAME`.
- The backend accepts both RS256 (Keycloak) and EdDSA (Better Auth). `OIDC_ISSUER` and `OIDC_AUDIENCE` are the origin of the auth URL.
- Vercel puts every visitor behind one proxy, so `CLIENT_IP_HEADER=x-real-ip` gives the rate limit the real client. Never set it where clients connect directly.

## Before calling it production

- [ ] Own Google OAuth client. Google sign-in uses Neon's shared development keys today.
- [ ] Own email provider and email verification. Neon's shared sender is rate limited.
- [ ] Turn off "Allow Localhost" in the Neon auth settings.
- [ ] Vercel Hobby is non-commercial. Move to Pro before selling anything.
- [ ] Enable Cloudflare R2 for previews and NFT files. Without it, share pages have no flower picture.
