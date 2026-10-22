# Development examples

These demos used to live under `src/components/examples` and were bundled even though no route imported them.

To reintroduce a demo during local development, copy the file into a route or story and import it from here.

- `ExecutionTraceDemo.tsx` — sample execution-trace UI
- `SocketStatusIndicator.tsx` — historical socket-status demo; the production component is `src/components/status/SocketStatusIndicator.tsx`
- `TokenRefreshExample.tsx` — historical token-refresh demo; production refresh lives in `src/hooks/useTokenRefresh.ts`

`src/services/README.md` points at this folder.
