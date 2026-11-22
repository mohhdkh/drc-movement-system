# Security Policy

## Reporting a vulnerability

Do not disclose suspected vulnerabilities, credentials, personal data, or production details in a public GitHub
issue.

Report the finding privately to the repository owner through an approved internal communication channel. Include:

- a concise description of the issue;
- the affected endpoint, role, or component;
- safe reproduction steps;
- the expected and observed behavior;
- the potential impact;
- any suggested mitigation.

Do not access data beyond what is required to demonstrate the issue, disrupt the service, test against production
without authorization, or include real credentials in the report.

## Supported version

The latest commit on `main` is the supported review version. Security fixes should be applied there and promoted
through the documented deployment process after CI and review.

## Security controls

The project includes Microsoft Entra authentication, local authoritative roles, strict CORS, security headers,
rate limiting, bounded payloads, verified PostgreSQL TLS, structured log redaction, readiness checks, and explicit
database migrations. Changes that weaken these controls require explicit security review.

Source control must contain synthetic demo records only. Personnel directories, phone numbers, operational Excel
exports, and official workbook templates belong in approved private systems and are blocked by `.gitignore`.
