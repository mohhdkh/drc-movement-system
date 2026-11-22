# Contributing

Thank you for improving the DRC Movement Management System. Changes should remain secure, reviewable, and
traceable because this application controls an institutional approval workflow.

## Development workflow

1. Create a focused branch from `main`.
2. Keep each pull request limited to one coherent change.
3. Add or update tests for behavior changes.
4. Run the required verification commands locally.
5. Open a pull request and complete its checklist.
6. Merge only after CI passes and the code owner has reviewed the change.

Suggested branch names:

- `feature/short-description`
- `fix/short-description`
- `docs/short-description`
- `chore/short-description`

## Required verification

```powershell
cd server
npm test

cd ../client
npm test
npm run lint
npm run build
```

## Commit guidance

Use concise, imperative commit messages that explain the outcome. Examples:

- `Add movement conflict validation`
- `Fix Area Manager review permissions`
- `Document PostgreSQL recovery procedure`

## Security and data handling

- Never commit `.env` files, access tokens, database URLs, certificates, or production exports.
- Never place a secret in a `VITE_` variable; these values are embedded in browser assets.
- Preserve server ownership of authorization, roles, statuses, audit fields, and workflow transitions.
- Use parameterized database queries and transactions for multi-record mutations.
- Keep logs free of request bodies, credentials, tokens, cookies, and personal data that is not operationally
  necessary.
- Do not weaken production TLS, CORS, authentication, rate limiting, or migration validation.

For a suspected vulnerability, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Pull-request expectations

A reviewer should be able to understand:

- what changed and why;
- which workflow roles and endpoints are affected;
- how the change was tested;
- whether database, configuration, deployment, or security behavior changed;
- how to roll back a risky operational change.
