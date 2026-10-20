# Backend API Contract

This document records the HTTP requests made by [`src/services/api.ts`](../src/services/api.ts) and [`src/services/agentService.ts`](../src/services/agentService.ts). Types and examples below describe the frontend's declared/consumed shapes; they are not evidence that every experimental backend route currently implements them. Confirm the backend before treating an example as a server guarantee. Fields shown with `...` are explanatory omissions, not literal JSON.

## Base URLs And Authentication

- `ApiService` uses `NEXT_PUBLIC_API_BASE_URL`, defaulting to `http://localhost:2333`.
- `AgentService` uses `NEXT_PUBLIC_AGENT_API_URL`, also defaulting to `http://localhost:2333`. These clients are separate even when configured to the same host.
- `ApiService` attaches `Authorization: Bearer <access-token>` when a token is present. Its explicit refresh call and the 401 interceptor send `POST /auth/refresh` with cookies (`withCredentials: true`).
- Next.js rewrites `/horizon/:path*` to `${NEXT_PUBLIC_API_BASE_URL || 'http://localhost:2333'}/proxy/:path*`. `horizonFetch` calls the local `/horizon` path; keep the backend `/proxy/:path*` handler available. Stellar Horizon reads made through `horizonFetch` are in `src/store/slices/accountSlice.ts`, not these service endpoint lists.
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
- Contact wrappers specially handle 404: `GET /contacts` becomes `{ success: true, data: [], message: ... }`; contact create/update/delete become `{ success: false, status: 404, message: ... }`. Other failures reject. The current `contactsSlice` uses mock thunks, so the contacts page does not currently reach these wrappers.
- Agent query wrappers catch failures and return `result.success: false`. Messages containing `invalid query`, `timeout`, or `network` map to friendly text; other failures use a generic unavailable/query-failed message. Chat displays the returned error/message to the user.
- The Google sign-in surface displays the caught error text. The liquidity widget displays generic inline errors (`Failed to fetch liquidity data` or `Error loading liquidity statistics`) rather than the backend message.
- Login/register forms currently dispatch mock Redux thunks rather than `apiService.login` / `apiService.register`. Their success/error toasts therefore do not establish the backend response contract.

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
| `POST /auth/register` | `{"email":"ada@example.test","password":"Example123!","name":"Ada"}` | `{"success":true,"message":"Registered","data":{"user":{"id":"u1","email":"ada@example.test","name":"Ada","address":"G...","publicKey":"G...","isDeployed":true,"isFunded":true,"tokenType":"XLM","authProvider":"email","isEmailVerified":false,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"},"token":"<jwt>","stellarAccount":{"address":"G...","publicKey":"G...","isDeployed":true},"starknetAccount":{"address":"G...","publicKey":"G...","isDeployed":true},"setupStatus":{"funding":{"success":true,"amount":"10"},"deployment":{"success":true},"fullyReady":true}}}` | API wrapper exists; registration form currently uses a mock Redux thunk, not this route. |
| `POST /auth/login` | `{"email":"ada@example.test","password":"Example123!"}` | `{"success":true,"message":"Signed in","data":{"user":{"id":"u1","email":"ada@example.test","name":"Ada","address":"G...","publicKey":"G...","isDeployed":true,"isFunded":true,"tokenType":"XLM","authProvider":"email","isEmailVerified":true,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"},"token":"<jwt>","stellarAccount":{"address":"G...","publicKey":"G...","isDeployed":true},"starknetAccount":{"address":"G...","publicKey":"G...","isDeployed":true}}}` | API wrapper exists; login form currently uses a mock Redux thunk. |
| `POST /auth/google-auth` | `{"token":"<google-id-token>"}` | Same declared shape as `LoginResponse` above. | Google sign-in flow; errors are shown in a toast. |
| `GET /auth/verify-email/{token}` | `GET /auth/verify-email/<verification-token>` | `{"success":true,"data":{"message":"Email verified"}}` | Service method only; no direct screen caller found. |
| `POST /auth/resend-verification` | `{"email":"ada@example.test"}` | `{"success":true,"data":{"message":"Verification email sent"}}` | Service method only; no direct screen caller found. |
| `POST /auth/forgot-password` | `{"email":"ada@example.test"}` | `{"success":true,"data":{"message":"Reset email sent"}}` | Service method only; no direct screen caller found. |
| `POST /auth/reset-password/{token}` | `POST /auth/reset-password/<reset-token>` with `{"password":"NewExample123!"}` | `{"success":true,"data":{"message":"Password reset"}}` | Service method only; no direct screen caller found. |
| `POST /auth/logout` | `{}`; cookies are included. | `204 No Content`; body is ignored. | Logout action from the chat layout/auth service; local credentials are cleared even if the request fails. |
| `POST /auth/refresh` | `{}`; cookies are included. | `{"token":"<new-jwt>"}` | Auth refresh thunk and automatic 401 refresh interceptor. |
| `GET /auth/me` | No body; bearer token when available. | `{"success":true,"data":{"id":"u1","email":"ada@example.test","name":"Ada","address":"G...","publicKey":"G...","isDeployed":true,"isFunded":true,"tokenType":"XLM","authProvider":"email","isEmailVerified":true,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}}` | `fetchProfile` auth thunk; the thunk consumes the `User` on success. |
| `GET /auth/profile` | No body; bearer token when available. | `{"success":true,"data":{"id":"u1","email":"ada@example.test","name":"Ada","address":"G...","publicKey":"G...","isDeployed":true,"isFunded":true,"tokenType":"XLM","authProvider":"email","isEmailVerified":true,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}}` | Service method only; no direct screen caller found. |
| `PUT /auth/profile` | `{"name":"Ada Lovelace"}` (any `Partial<User>` fields). | `{"success":true,"data":{"id":"u1","email":"ada@example.test","name":"Ada Lovelace","address":"G...","publicKey":"G...","isDeployed":true,"isFunded":true,"tokenType":"XLM","authProvider":"email","isEmailVerified":true,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z"}}` | Service method only; current profile update thunk is mocked. |
| `POST /auth/change-password` | `{"currentPassword":"Example123!","newPassword":"NewExample123!"}` | `{"success":true,"data":{"message":"Password changed"}}` | Service method only; no direct screen caller found. |
| `DELETE /auth/account` | No body; bearer token when available. | `{"success":true,"data":{"message":"Account deleted"}}` | Service method only; clears the in-memory/local token after the request resolves. |

### Data Export Fallbacks

`exportUserData()` tries these paths in order, moving to the next only on HTTP 404. Each successful response is consumed as a binary `Blob`, not JSON.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `GET /data-export` | No body; bearer token when available. | `200` with `Content-Type: application/octet-stream` and downloadable bytes. | Service method only. |
| `GET /data/export` | Same request; tried only if the preceding path returns 404. | `200` with downloadable bytes (`Blob`). | Service fallback candidate only. |
| `GET /api/data-export` | Same request; tried only if both preceding paths return 404. | `200` with downloadable bytes (`Blob`). | Service fallback candidate only. |

## Account Endpoints

The service includes methods for Stellar/Starknet account and funding paths, but most similarly named Redux account thunks currently return mock values. `getAccountTransactions` is the exception and is used by the account transaction flow.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `POST /auth/starknet/deploy` | `{}` | `{"success":true,"data":{"transactionHash":"0xabc","contractAddress":"0xdef"}}` | Service method only; deploy thunk currently returns mock data. |
| `GET /auth/starknet/balance` | No body; bearer token when available. | `{"success":true,"data":{"hasBalance":true,"balance":"12.5","required":"1","nativeBalance":"12.5"}}` | Service method only; balance thunk currently returns mock data. |
| `GET /auth/starknet/status` | No body; bearer token when available. | `{"success":true,"data":{"isDeployed":true,"isFunded":true,"address":"G...","publicKey":"G..."}}` | Service method only; status thunk currently returns mock data. |
| `POST /auth/funding/fund-account` | `{}` | `{"success":true,"data":{"transactionHash":"0xabc","amount":"10"}}` | Service method only; funding thunk currently returns mock data. |
| `GET /auth/funding/auto-funding-stats` | No body. | `{"success":true,"data":{"totalFunded":10,"totalAccounts":8,"averageAmount":"5.25"}}` | Service method only; stats thunk currently returns mock data. |
| `GET /auth/funding/funded-account-balance` | No body. | `{"success":true,"data":{"balance":"10","hasBalance":true}}` | Service method only; no direct screen caller found. |
| `POST /auth/funding/batch-fund` | `{"amounts":["1","2.5"]}` | `{"success":true,"data":{"transactionHashes":["0xabc","0xdef"],"totalAmount":"3.5"}}` | Service method only; no direct screen caller found. |
| `GET /account/{userId}/transactions?page={page}&limit={limit}` | `GET /account/u1/transactions?page=1&limit=10` | `{"success":true,"data":{"transactions":[],"total":0,"page":1,"limit":10}}` | Account transaction thunk/dashboard; errors are stored in account state. |

Transaction records expose a `successful` boolean. The status filters therefore offer **Successful** and **Failed**; neither the account response nor Stellar Horizon's transaction list exposes a pending status, so pending must not be inferred as failed. The account endpoint currently supports `page` and `limit`, but not server-side status filtering; the dashboard table filters the currently loaded page.

## Contacts Endpoints

`Contact` is `{ id, name, address, tokenType, createdAt, updatedAt, avatar?, isFavorite?, lastUsed? }`. Create requires `name`, `address`, and a `tokenType` from `XLM | USDC | USDT | BTC | ETH`; update accepts those fields optionally.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `GET /contacts` | No body; bearer token when available. | `{"success":true,"data":[{"id":"c1","name":"Ada","address":"G...","tokenType":"XLM","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}]}` | Contacts page/send flow is present, but its current Redux thunks return mock data and do not call this method. |
| `POST /contacts` | `{"name":"Ada","address":"G...","tokenType":"XLM"}` | `{"success":true,"data":{"id":"c1","name":"Ada","address":"G...","tokenType":"XLM","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}}` | Same wrapper-only caveat; 404 becomes an explanatory failure envelope. |
| `PUT /contacts/{id}` | `PUT /contacts/c1` with `{"name":"Ada Lovelace"}` | `{"success":true,"data":{"id":"c1","name":"Ada Lovelace","address":"G...","tokenType":"XLM","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z"}}` | Same wrapper-only caveat; 404 becomes an explanatory failure envelope. |
| `DELETE /contacts/{id}` | `DELETE /contacts/c1` | `{"success":true,"data":{"message":"Contact deleted"}}` | Same wrapper-only caveat; 404 becomes an explanatory failure envelope. |

## Liquidity Endpoint

`LiquidityRequest` fields are optional: `includeInactive`, `limit`, `sortBy` (`liquidity | volume | apr`), and `sortOrder` (`asc | desc`). The UI polls this endpoint every 30 seconds and requests the ten highest-liquidity pools.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `POST /liquidity` | `{"sortBy":"liquidity","sortOrder":"desc","limit":10}` | `{"success":true,"data":{"totalPools":1,"totalLiquidity":"100000","totalVolume24h":"5000","averageAPR":0.12,"activePools":1,"topPools":[],"networkMetrics":{"gasPrice":"1","blockNumber":123,"timestamp":"2026-01-01T00:00:00Z"}}}` | `LiquidityPoolStats` widget; errors show a generic inline message. |

`topPools` items use `LiquidityPool`: pool id/name, token1/token2 metadata, reserve and liquidity strings, APR, 24-hour volume, fee, active flag, and `created_at`.

## Browser Security And CSP Reports

Next.js applies the security headers defined in [`src/security/securityHeaders.ts`](../src/security/securityHeaders.ts) to every route. The content security policy allows Google OAuth and font endpoints, Stellar Horizon, and API/socket origins configured by `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_SOCKET_URL`.

Browsers can submit CSP violation reports to `POST /api/csp-report`. The endpoint accepts legacy `csp-report` and Reporting API `body` JSON, caps input at 16 KiB, and logs only the document URL, blocked URL, and violated directive. It does not require authentication because browsers send reports automatically. Production responses include HSTS; development responses omit HSTS and allow `unsafe-eval` for the development bundler. Review CSP reports when adding a browser integration, then add only its required origin to the policy.
