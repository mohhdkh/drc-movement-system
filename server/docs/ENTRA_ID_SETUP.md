# Microsoft Entra ID Setup

## Authentication Model

The application has two explicit authentication providers:

- `AUTH_PROVIDER=development` keeps the existing loopback-only `x-development-user-id` workflow.
- `AUTH_PROVIDER=entra` accepts only a Microsoft Entra access token in `Authorization: Bearer <token>`.

Production requires `AUTH_PROVIDER=entra`; it never falls back to development identity headers. Entra proves
identity, while the local `users` and `user_roles` tables remain authoritative for account activation and
authorization. Roles or groups carried in a token do not grant application access.

Use two single-tenant app registrations so the browser client and protected API have separate identities.
No client secret belongs in the SPA or is required by this authorization-code-with-PKCE flow.

## API App Registration

1. Register a single-tenant web API application.
2. Under **Expose an API**, set an Application ID URI and add a delegated scope such as `access_as_user`.
3. Record its application (client) ID and tenant ID.
4. Grant the SPA registration delegated permission to this API scope and complete tenant consent if required
   by organizational policy.

Configure the API process with server-side variables:

```dotenv
AUTH_PROVIDER=entra
ENTRA_TENANT_ID=<tenant-guid>
ENTRA_ALLOWED_TENANT_ID=<same-tenant-guid>
ENTRA_CLIENT_ID=<api-application-client-id>
ENTRA_AUDIENCE=api://<api-application-client-id>
ENTRA_ISSUER=https://login.microsoftonline.com/<tenant-guid>/v2.0
```

Set `ENTRA_AUDIENCE` to the exact `aud` value issued for this API. `ENTRA_CLIENT_ID` records the API
registration and must not be confused with the SPA client ID. Optional bounded network/cache controls are
documented in `server/.env.example`.

The backend downloads tenant metadata and signing keys over HTTPS, caches them, and performs one cooldown-
limited refresh when a previously unknown signing key ID is received. It accepts only `RS256` and validates
the signature, issuer, audience, `exp`, `nbf`, `iat`, tenant ID, and object ID. Metadata requests have bounded
timeouts, retry only transient failures, reject redirects, and never log bearer tokens.

## SPA App Registration

1. Register a single-tenant SPA application.
2. Add every exact production and approved local redirect URI under the **Single-page application** platform.
3. Add delegated permission for the API scope created above.
4. Do not create or place a client secret in client configuration.

Set these public values at client build time:

```dotenv
VITE_AUTH_PROVIDER=entra
VITE_ENTRA_CLIENT_ID=<spa-application-client-id>
VITE_ENTRA_TENANT_ID=<tenant-guid>
VITE_ENTRA_REDIRECT_URI=https://movement.example.org
VITE_ENTRA_API_SCOPE=api://<api-application-client-id>/access_as_user
VITE_API_BASE_URL=https://api.example.org/api
```

MSAL stores its browser cache in `sessionStorage`. Before each API request the client calls
`acquireTokenSilent` and sends the returned access token as a bearer token. Application code does not persist
access tokens in local storage. Sign-out clears the configured token provider and starts an MSAL logout.

## Local Account Mapping

An Admin must first create the local user, assign local roles, and use the same normalized email address as the
Entra UPN or email. On the first valid login, the server links `{tenant ID, object ID}` only when exactly one
active, currently unlinked local user has that exact address. The link and `ENTRA_ACCOUNT_LINKED` audit record
are committed atomically. Later logins use only the immutable tenant/object pair.

Unknown, inactive, ambiguous, or already-conflicting mappings are denied. Authentication never creates a
local user and never imports token roles or groups. Admin users can see only linked/not-linked state and the
stored principal name; object IDs and token claims are not exposed in normal UI or `/api/auth/me`.

## Verification And Activation

Before enabling users:

```powershell
cd server
npm test
npm run db:postgres:migrate
npm run db:postgres:status
npm run production:check

cd ../client
npm run lint
npm run build
```

Then use a non-production pilot account to verify login, `/api/auth/me`, all locally assigned workspaces, an
Admin status read at `/api/admin/integrations/entra/status`, logout, denied inactive users, and signing-key
refresh behavior. The status endpoint intentionally reports only booleans and `metadata: not-tested`; it does
not expose tenant IDs, application IDs, issuer URLs, tokens, or credentials.

If login fails, compare the token's intended API audience, tenant, v2 issuer, requested delegated scope, and
the exact SPA redirect URI without pasting the token into logs or tickets. If authentication succeeds but
access is denied, check for one active local email match, an existing conflicting link, and required local
roles. Keep tenant/app identifiers in deployment configuration and all database credentials in the managed
server secret store.

Automated tests use locally generated RSA keys and mocked metadata/JWKS responses. They do not prove that a
real tenant, consent policy, redirect URI, or deployed HTTPS topology is configured correctly. Phase 11 must
not be called live-verified until the pilot checklist succeeds against the organization's tenant.
