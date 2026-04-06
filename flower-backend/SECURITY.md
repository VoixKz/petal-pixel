# Security Policy

## Supported versions

Security updates are provided for the latest version on main.

## Reporting a vulnerability

Please do not open public issues for vulnerabilities.

Report privately with:

- clear reproduction steps
- impact assessment
- affected endpoints or files

Recommended response targets:

- acknowledge within 72 hours
- provide triage status within 7 days
- release fix timeline after validation

## Secrets handling

- Never commit .env with real credentials.
- Use .env.example for placeholders only.
- Rotate DB/S3/API credentials immediately if leaked.

## Hardening checklist

- Use least-privilege database role.
- Restrict S3 bucket access and public URLs.
- Configure GRPC_WEB_ALLOWED_ORIGINS in non-local environments.
- Keep dependencies updated and patch critical CVEs quickly.
