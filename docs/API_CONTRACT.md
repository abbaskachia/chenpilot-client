
# Backend API Contract

This document records the HTTP requests made by [`src/services/api.ts`](../src/services/api.ts) and [`src/services/agentService.ts`](../src/services/agentService.ts). Types and examples below describe the frontend's declared/consumed shapes; they are not evidence that every experimental backend route currently implements them. Confirm the backend before treating an example as a server guarantee. Fields shown with `...` are explanatory omissions, not literal JSON.

## Base URLs And Authentication

- `ApiService` uses `NEXT_PUBLIC_API_BASE_URL`, defaulting to `http://localhost:2333`.
- `AgentService` uses `NEXT_PUBLIC_AGENT_API_URL`, also defaulting to `http://localhost:2333`. These clients are separate even when configured to the same host.
- `ApiService` attaches `Authorization: Bearer <access-token>` when a token is present. Its explicit refresh call and the 401 interceptor send `POST /auth/refresh` with cookies (`withCredentials: true`).
- Next.js rewrites `/horizon/:path*` to `${NEXT_PUBLIC_API_BASE_URL || 'http://localhost:2333'}/proxy/:path*`. `horizonFetch` calls the local `/horizon` path; keep the backend `/proxy/:path*` handler available. Stellar Horizon reads made through `horizonFetch` are in `src/store/slices/accountSlice.ts`, not these service endpoint lists.
- `NEXT_PUBLIC_STELLAR_NETWORK` must be explicitly set to `mainnet` or `testnet` for the UI to identify the active network. Missing or unsupported values display `Network unknown`; do not infer it from `NODE_ENV`. The backend Horizon proxy and payment execution service must be configured for the same network. This frontend configuration does not itself switch backend networks.
- `ApiResponse<T>` is the declared envelope for many methods:

	```ts
	type ApiSuccess<T> = { success: true; data: T; message?: string };
	type ApiError = { success: false; status: number; message: string };
	type ApiResponse<T> = ApiSuccess<T> | ApiError;
	```

	Not all methods use this envelope: login/register have dedicated response types, balance has its own shape, and agent responses use `result`.

## Error Handling And User Messages

- Axios HTTP failures normally reject with an Axios error; the client does not normalize every backend error body into `ApiError`. `ApiError.status` is a number, not a closed set of application error codes. The backend error envelope beyond that type is not specified here.
- A 401 on an `ApiService` request triggers one queued refresh attempt and then retries the original request once. If refresh fails, local auth is cleared and the browser is sent to `/auth/login`. The auth UI may show the rejected thunk/error message.
- The retry interceptor retries eligible network failures and the configured 408, 429, and 5xx statuses, subject to method safety; 503 is retried for any method. It exposes retry state to the UI. This is transport retry behavior, not an application error envelope.
- Contact wrappers specially handle 404: `GET /contacts` becomes `{ success: true, data: [], message: ... }`; contact create/update/delete become `{ success: false, status: 404, message: ... }`. Other failures reject.
- Agent query wrappers catch failures and return `result.success: false`. Messages containing `invalid query`, `timeout`, or `network` map to friendly text; other failures use a generic unavailable/query-failed message. Chat displays the returned error/message to the user.
- The Google sign-in surface displays the caught error text. The liquidity widget displays generic inline errors (`Failed to fetch liquidity data` or `Error loading liquidity statistics`) rather than the backend message.
- Login/register forms dispatch auth thunks; the backend response contract is documented in the Authentication Endpoints table below.

## Agent Endpoints

These routes use `NEXT_PUBLIC_AGENT_API_URL` through `AgentService`, except `apiService.queryAgent`, which may use this agent service first and otherwise posts to the API base URL's `/query`.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `HEAD /` | No body; health probe. | `200`, no response body is consumed. The client synthesizes its `AgentHealthCheck`. | Agent connectivity initialization; status object is synthesized, not returned by the server. |
| `POST /query` | `{"userId":"user-1","query":"What is my XLM balance?"}` | `{"result":{"success":true,"data":"Your balance is ...","error":null}}` (`executionTrace` is optional). | Chat query; failures become friendly `result` messages shown in chat. |
| `GET /memory/{userId}` | `GET /memory/user-1` | `[]` (declared `string[]`). | Service method only; failures are logged and return an empty list. |
| `DELETE /memory/{userId}` | `DELETE /memory/user-1` | `204 No Content`; the response body is ignored. | Service method only; failures reject as `Failed to clear agent memory`. |
| `GET /tools` | No body. | `[]` (the service currently does not declare tool item fields). | Service method only; failure returns an empty list. |
| `POST /tools/{toolName}/execute` | `POST /tools/swap/execute` with `{"from":"XLM","to":"USDC","amount":"10"}` | Example pass-through: `{"result":"..."}`. The service does not define or validate this response shape. | Service method only; errors are rethrown as a tool failure. |

`getStatus()` and `getCapabilities()` return local objects and do not make HTTP requests. Do not document `/status` or `/capabilities` as backend routes unless those calls are implemented.

## Authentication Endpoints

`User` response fields are `id`, `email`, `name`, `address`, `publicKey`, `isDeployed`, `isFunded`, `tokenType`, `authProvider`, `isEmailVerified`, `createdAt`, and `updatedAt`. `RegisterResponse` additionally declares `stellarAccount`, the backward-compatible `starknetAccount` alias, and `setupStatus` with funding/deployment results.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `POST /auth/register` | `{"email":"ada@example.test","password":"Example123!","name":"Ada"}` | `{"success":true,"message":"Registered","data":{"user":{"id":"u1","email":"ada@example.test","name":"Ada","address":"G...","publicKey":"G...","isDeployed":true,"isFunded":true,"tokenType":"XLM","authProvider":"email","isEmailVerified":false,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"},"token":"<jwt>","stellarAccount":{"address":"G...","publicKey":"G...","isDeployed":true},"starknetAccount":{"address":"G...","publicKey":"G...","isDeployed":true},"setupStatus":{"funding":{"success":true,"amount":"10"},"deployment":{"success":true},"fullyReady":true}}}` | Registration form; API wrapper available. |
| `POST /auth/login` | `{"email":"ada@example.test","password":"Example123!"}` | `{"success":true,"message":"Signed in","data":{"user":{"id":"u1","email":"ada@example.test","name":"Ada","address":"G...","publicKey":"G...","isDeployed":true,"isFunded":true,"tokenType":"XLM","authProvider":"email","isEmailVerified":true,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"},"token":"<jwt>","stellarAccount":{"address":"G...","publicKey":"G...","isDeployed":true},"starknetAccount":{"address":"G...","publicKey":"G...","isDeployed":true}}}` | Login form; API wrapper available. |
| `POST /auth/google-auth` | `{"token":"<google-id-token>"}` | Same declared shape as `LoginResponse` above. | Google sign-in flow; errors are shown in a toast. |
| `GET /auth/verify-email/{token}` | `GET /auth/verify-email/<verification-token>` | `{"success":true,"data":{"message":"Email verified"}}` | Service method only; no direct screen caller found. |
| `POST /auth/resend-verification` | `{"email":"ada@example.test"}` | `{"success":true,"data":{"message":"Verification email sent"}}` | Service method only; no direct screen caller found. |
| `POST /auth/forgot-password` | `{"email":"ada@example.test"}` | `{"success":true,"data":{"message":"Reset email sent"}}` | Service method only; no direct screen caller found. |
| `POST /auth/reset-password/{token}` | `POST /auth/reset-password/<reset-token>` with `{"password":"NewExample123!"}` | `{"success":true,"data":{"message":"Password reset"}}` | Service method only; no direct screen caller found. |
| `POST /auth/logout` | `{}`; cookies are included. | `204 No Content`; body is ignored. | Logout action from the chat layout/auth service; local credentials are cleared even if the request fails. |
| `POST /auth/refresh` | `{}`; cookies are included. | `{"token":"<new-jwt>"}` | Auth refresh thunk and automatic 401 refresh interceptor. |
| `GET /auth/me` | No body; bearer token when available. | `{"success":true,"data":{"id":"u1","email":"ada@example.test","name":"Ada","address":"G...","publicKey":"G...","isDeployed":true,"isFunded":true,"tokenType":"XLM","authProvider":"email","isEmailVerified":true,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}}` | `fetchProfile` auth thunk; the thunk consumes the `User` on success. |
| `GET /auth/profile` | No body; bearer token when available. | `{"success":true,"data":{"id":"u1","email":"ada@example.test","name":"Ada","address":"G...","publicKey":"G...","isDeployed":true,"isFunded":true,"tokenType":"XLM","authProvider":"email","isEmailVerified":true,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}}` | Service method only; no direct screen caller found. |
| `PUT /auth/profile` | `{"name":"Ada Lovelace"}` (any `Partial<User>` fields). | `{"success":true,"data":{"id":"u1","email":"ada@example.test","name":"Ada Lovelace","address":"G...","publicKey":"G...","isDeployed":true,"isFunded":true,"tokenType":"XLM","authProvider":"email","isEmailVerified":true,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z"}}` | Service method; profile update route available. |
| `POST /auth/change-password` | `{"currentPassword":"Example123!","newPassword":"NewExample123!"}` | `{"success":true,"data":{"message":"Password changed"}}` | Service method only; no direct screen caller found. |
| `DELETE /auth/account` | No body; bearer token when available. | `{"success":true,"data":{"message":"Account deleted"}}` | Service method only; clears the in-memory/local token after the request resolves. |

Protected settings actions include password changes, MFA changes, and device management. Password and MFA changes require re-verifying the current email/password with `POST /auth/login`; the response token is discarded and the in-memory verification grant expires after five minutes or when leaving settings. Password changes still send `currentPassword` to `POST /auth/change-password` as required by its existing contract. The settings UI validates password and confirmation with the shared `changePasswordSchema` (at least eight characters, uppercase, lowercase, and a number) and shows the shared strength meter. Google-only accounts cannot use the password-change flow, and provider re-authentication for MFA is not available for Google-only accounts. MFA enrollment and verification are described below. Device-management routes are not defined in this client. The backend must enforce recent authentication itself for protected operations (a client-side gate is not an authorization boundary).

### Multi-Factor Authentication (MFA) Specification & Contract Notes

**Current Implementation Status:**
- Authoritative backend MFA endpoints are currently **NOT implemented or deployed** on the backend.
- The client provides typed service integration (`ApiService.getMfaStatus`, `ApiService.initiateMfaEnrollment`, `ApiService.verifyMfaEnrollment` and `AuthService`) that safely detects unsupported/missing backend routes (HTTP 404/501) and presents clear states without fabricating backend enrollment or falsely marking MFA as enabled.
- The settings UI exposes explicit states: `Disabled`, `Enrollment in progress`, `Awaiting verification`, `Enabled`, `Recovery in progress` (when recovery codes are returned), and `Error / Unsupported`.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `GET /auth/mfa/status` | No body; bearer token required. | `{"success":true,"data":{"enabled":false,"method":"totp"}}` | Settings security panel; checks authoritative MFA status. 404 is treated as unsupported (disabled). |
| `POST /auth/mfa/enroll` | `{}`; bearer token required. | `{"success":true,"data":{"secret":"JBSWY3DPEHPK3PXP","qrCodeUrl":"https://...","otpAuthUri":"otpauth://totp/ChenPilot:user?secret=...","recoveryCodes":["REC-1111","REC-2222"]}}` | Settings security panel; initiates enrollment. Returns secret key and TOTP URI. 404 displays unsupported capability error. |
| `POST /auth/mfa/verify` | `{"code":"123456"}`; bearer token required. | `{"success":true,"data":{"enabled":true,"message":"MFA enabled successfully","recoveryCodes":["REC-1111","REC-2222"]}}` | Settings security panel; verifies 6-digit TOTP code. Authoritative confirmation is required before enabling MFA. |

**MFA Challenge During Login:**
- `POST /auth/login` currently returns full tokens immediately and does not issue an intermediate MFA challenge.
- When MFA login enforcement is implemented on the backend, `POST /auth/login` must return a challenge state (e.g., `{ success: true, data: { mfaRequired: true, challengeToken: "<temp-token>", method: "totp" } }`) and a corresponding `POST /auth/mfa/challenge` endpoint must be established.

**MFA Recovery and Cancellation:**
- Recovery: The backend does not currently provide an endpoint for regenerating recovery codes or authenticating via recovery code. When recovery codes are provided during initial enrollment, the client displays them once and instructs the user to store them securely.
- Cancellation: The user can cancel setup at any time prior to verification. Cancellation immediately purges all transient enrollment secrets and one-time codes from memory.
- Storage & Security: The client **never** persists MFA secrets, temporary OTP codes, or recovery codes in `localStorage` or `sessionStorage`. All sensitive values reside in volatile React state and are cleared on component unmount, cancellation, or flow completion.
- Blockers: Production MFA cannot be marked enabled for accounts until the backend implements and confirms the `/auth/mfa/enroll` and `/auth/mfa/verify` routes.

### Data Export Fallbacks

`exportUserData()` tries these paths in order, moving to the next only on HTTP 404. Each successful response is consumed as a binary `Blob`, not JSON.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `GET /data-export` | No body; bearer token when available. | `200` with `Content-Type: application/octet-stream` and downloadable bytes. | Service method only. |
| `GET /data/export` | Same request; tried only if the preceding path returns 404. | `200` with downloadable bytes (`Blob`). | Service fallback candidate only. |
| `GET /api/data-export` | Same request; tried only if both preceding paths return 404. | `200` with downloadable bytes (`Blob`). | Service fallback candidate only. |

## Account Endpoints

The service includes methods for Stellar/Starknet account and funding paths. `getAccountTransactions` is used by the account transaction flow.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `POST /auth/starknet/deploy` | `{}` | `{"success":true,"data":{"transactionHash":"0xabc","contractAddress":"0xdef"}}` | Service method; Starknet deploy route. |
| `GET /auth/starknet/balance` | No body; bearer token when available. | `{"success":true,"data":{"hasBalance":true,"balance":"12.5","required":"1","nativeBalance":"12.5"}}` | Service method; Starknet balance route. |
| `GET /auth/starknet/status` | No body; bearer token when available. | `{"success":true,"data":{"isDeployed":true,"isFunded":true,"address":"G...","publicKey":"G..."}}` | Service method; Starknet status route. |
| `POST /auth/funding/fund-account` | `{}` | `{"success":true,"data":{"transactionHash":"0xabc","amount":"10"}}` | Service method; funding route. |
| `GET /auth/funding/auto-funding-stats` | No body. | `{"success":true,"data":{"totalFunded":10,"totalAccounts":8,"averageAmount":"5.25"}}` | Service method; funding statistics route. |
| `GET /auth/funding/funded-account-balance` | No body. | `{"success":true,"data":{"balance":"10","hasBalance":true}}` | Service method only; no direct screen caller found. |
| `POST /auth/funding/batch-fund` | `{"amounts":["1","2.5"]}` | `{"success":true,"data":{"transactionHashes":["0xabc","0xdef"],"totalAmount":"3.5"}}` | Service method only; no direct screen caller found. |
| `GET /account/{userId}/transactions?page={page}&limit={limit}` | `GET /account/u1/transactions?page=1&limit=10` | `{"success":true,"data":{"transactions":[],"total":0,"page":1,"limit":10}}` | Account transaction thunk/dashboard; errors are stored in account state. |

### Transaction Status Filtering

Transaction history filters agree with the backend data model and the transaction lifecycle contract (`pending | confirmed | failed`). The history status filters support **All statuses** (`all`), **Confirmed** (`confirmed`, synonymous with `successful`), **Failed** (`failed`), and **Pending** (`pending`).

- **Confirmed / Successful**: Matches transactions with `status === 'confirmed'` or authoritative ledger transactions where `successful === true`.
- **Failed**: Matches transactions with `status === 'failed'` or `successful === false`, keeping `pending` strictly distinct so pending transactions are never inferred or grouped as failed.
- **Pending**: Matches submitted transactions in the lifecycle contract awaiting authoritative ledger confirmation (`status === 'pending'`). In the transaction history view, pending confirmations are kept distinct and filtered accordingly.

Filtering is executed client-side over loaded transaction records and pending confirmations, preserving pagination and Horizon cursor state (`nextCursor`) so users can load older pages while keeping the active filter applied. The account endpoint currently supports `page` and `limit`, but not server-side status filtering; the dashboard table and transactions page filter loaded data without resetting or dropping cursor state.

### Transaction Schema & Direction Contract

`StellarTransaction` records returned by `GET /account/{userId}/transactions` contain `id`, `hash`, `ledger`, `created_at`, `source_account`, `fee_charged`, `operation_count`, `successful`, `operations: StellarOperation[]`, and optional `direction`. Each `StellarOperation` contains `id`, `type`, `source_account`, optional `amount`, optional `asset` (or `asset_code`, `asset_issuer`, `asset_type`), optional `from`, optional `to`, and optional `direction`.

Direction classification (`incoming | outgoing | self | unknown`) is resolved dynamically for transaction rows against the signed-in user's active account address:

- **`incoming`**: Destination account (`to`) matches the active account address, and source account does not. Formatted with a `+` prefix and emerald styling.
- **`outgoing`**: Source account (`from`, `source_account`, or transaction `source_account`) matches the active account address, and destination account is specified and does not match the active account. Formatted with a `-` prefix and rose styling.
- **`self`**: Both source and destination accounts match the active account address (self-transfers). Formatted neutrally without directional signs.
- **`unknown`**: Missing active address, missing operation accounts, non-transfer operations, or third-party operations. Formatted neutrally with `-` for missing amounts.

### Asset Canonical Identification & Issuer Handling

Asset codes alone do not globally identify issued assets on Stellar (multiple distinct issuers may issue tokens with identical tickers, e.g., `USDC`). The client prevents ambiguous ticker presentation through the following contract:
- **Canonical Asset Identifier**: Issued assets are uniquely identified by `<CODE>:<ISSUER>` (e.g., `USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`). Native currency resolves canonically to `XLM` without an issuer.
- **Same-Code Distinct Issuers**: Transactions involving the same asset code (e.g., `USDC`) from distinct issuers display the formatted issuer address alongside the ticker and expose the full canonical identifier on title/hover, ensuring distinct assets cannot be conflated.
- **Incomplete Metadata Fallback**: When an operation specifies an issued asset code without an issuer or canonical pair, the client applies a safe fallback: the ticker is rendered with an explicit `unverified issuer` badge to alert the user of incomplete metadata, while native fallbacks default safely to `XLM`.

## Payment Submission And Status (Backend Support Required)

The send-payment UI now requires explicit confirmation before calling the payment service. The frontend declares the following backend contract, but no existing payment route was present in this repository; verify and implement these routes on the backend before enabling real payments.

| Endpoint | Request example | Expected success response | Client behavior |
| --- | --- | --- | --- |
| `POST /payments` | `{"recipientAddress":"G...","amount":"1.25","tokenType":"XLM","memoType":"none"}` with `Idempotency-Key: <uuid>` | `{"success":true,"data":{"status":"submitted","transactionHash":"<hash>"}}` (transaction reference optional while pending) | Payment operations are excluded from automatic retries. The backend must atomically deduplicate a key and return the original result for repeated submissions with that key. |
| `GET /payments/status?idempotencyKey=<uuid>` | Same idempotency key from the original submit | `{"success":true,"data":{"status":"pending|submitted|confirmed|failed","transactionHash":"<hash>"}}` | A transport failure, timeout, or 5xx leaves the UI in an outcome-unknown state with a status-check action; it must not resubmit automatically. A definitive 4xx is shown as a failed submission. |

The backend should return an explicit `confirmed` result only after it has authoritative confirmation. A `not_found` or unavailable status is not permission to resubmit: the client retains the original key and asks the user to check again. Ensure `/payments/status` is scoped to the authenticated user and does not disclose another user's payment status.
## Contacts Endpoints

`Contact` is `{ id, name, address, tokenType, createdAt, updatedAt, avatar?, isFavorite?, lastUsed? }`. Create requires `name`, `address`, and a `tokenType` from `XLM | USDC | USDT | BTC | ETH`; update accepts those fields optionally.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `GET /contacts` | No body; bearer token when available. | `{"success":true,"data":[{"id":"c1","name":"Ada","address":"G...","tokenType":"XLM","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}]}` | Contacts page/send flow; wrappers handle 404 specially. |
| `POST /contacts` | `{"name":"Ada","address":"G...","tokenType":"XLM"}` | `{"success":true,"data":{"id":"c1","name":"Ada","address":"G...","tokenType":"XLM","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}}` | Same wrapper-only caveat; 404 becomes an explanatory failure envelope. |
| `PUT /contacts/{id}` | `PUT /contacts/c1` with `{"name":"Ada Lovelace"}` | `{"success":true,"data":{"id":"c1","name":"Ada Lovelace","address":"G...","tokenType":"XLM","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z"}}` | Same wrapper-only caveat; 404 becomes an explanatory failure envelope. |
| `DELETE /contacts/{id}` | `DELETE /contacts/c1` | `{"success":true,"data":{"message":"Contact deleted"}}` | Same wrapper-only caveat; 404 becomes an explanatory failure envelope. |

The contacts screen searches the complete loaded contact list and renders 24 matches per page. This is client-side pagination; the current contacts contract does not define page/limit parameters, so no paginated backend response is assumed.

The payment screen may use `data.nativeBalance` as the total native balance and `data.required` as the minimum required reserve. It displays spendable XLM as `max(0, nativeBalance - required)` only when both values are finite numbers; this is a display estimate, not a payment authorization guarantee. Reserve-related payment failures are translated when the backend message mentions a reserve or minimum/insufficient native balance. No stable backend error code is currently declared.

## Liquidity Endpoint

`LiquidityRequest` fields are optional: `includeInactive`, `limit`, `sortBy` (`liquidity | volume | apr`), and `sortOrder` (`asc | desc`). The UI polls this endpoint every 30 seconds and requests the ten highest-liquidity pools.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `POST /liquidity` | `{"sortBy":"liquidity","sortOrder":"desc","limit":10}` | `{"success":true,"data":{"totalPools":1,"totalLiquidity":"100000","totalVolume24h":"5000","averageAPR":0.12,"activePools":1,"topPools":[],"networkMetrics":{"gasPrice":"1","blockNumber":123,"timestamp":"2026-01-01T00:00:00Z"}}}` | `LiquidityPoolStats` widget; errors show a generic inline message. |

`topPools` items use `LiquidityPool`: pool id/name, token1/token2 metadata, reserve and liquidity strings, APR, 24-hour volume, fee, active flag, and `created_at`.

## Browser Security And CSP Reports

Next.js applies the security headers defined in [`src/security/securityHeaders.ts`](../src/security/securityHeaders.ts) to every route. The content security policy allows Google OAuth and font endpoints, Stellar Horizon, and API/socket origins configured by `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_SOCKET_URL`.

Browsers can submit CSP violation reports to `POST /api/csp-report`. The endpoint accepts legacy `csp-report` and Reporting API `body` JSON, caps input at 16 KiB, and logs only the document URL, blocked URL, and violated directive. It does not require authentication because browsers send reports automatically. Production responses include HSTS; development responses omit HSTS and allow `unsafe-eval` for the development bundler. Review CSP reports when adding a browser integration, then add only its required origin to the policy.

- `POST /auth/refresh` | `{}`; cookies are included. | `{"token":"<new-jwt>"}` | Auth refresh thunk and automatic 401 refresh interceptor. Socket connections safely update authentication and reconnect once without leaking listeners or opening duplicate connections.
