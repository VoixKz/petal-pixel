# Security Policy

## Supported versions

Security fixes are applied to the latest main branch.

## Reporting a vulnerability

Please report vulnerabilities privately and avoid public issues.

Include:

- reproduction steps
- expected and actual behavior
- impact and affected area

Recommended response targets:

- acknowledge within 72 hours
- share triage status within 7 days

## Environment safety

- Never commit .env with secrets or private tokens.
- Frontend must only use publishable Supabase key.
- Never expose Supabase service role key in client code.

## Hardening checklist

- Enforce least-privilege Supabase policies (RLS).
- Restrict allowed auth providers and redirect URLs.
- Keep dependencies updated and patch high severity CVEs.
- Review PRs for accidental credential leaks before merge.
