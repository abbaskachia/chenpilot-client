# Testing

This project uses Vitest with `jsdom` and Testing Library. The configuration is in [`vitest.config.ts`](../vitest.config.ts); [`src/test/setup.ts`](../src/test/setup.ts) loads `@testing-library/jest-dom` matchers.

## Commands

This project uses **pnpm** exclusively. Do not use `npm` or `yarn` — `package-lock.json` and `yarn.lock` are gitignored to prevent accidental lockfile drift. The `packageManager` field in `package.json` declares the supported version and enables Corepack enforcement.

Run the full suite once:

```bash
pnpm test
```

Keep Vitest running and rerun affected tests as files change:

```bash
pnpm test:watch
```

Run the suite and print a V8 coverage report (also written to `coverage/`):

```bash
pnpm test:coverage
```

Pass a file path after `--` to run a focused test, for example:

```bash
pnpm test -- src/utils/passwordStrength.test.ts
```

## Placement And Naming

Vitest includes `src/**/*.test.ts` and `src/**/*.test.tsx` only. Put a test beside its implementation for a small, focused module, or group related tests in a local `__tests__` directory. Use `.test.ts` for non-React unit tests and `.test.tsx` for tests that render JSX. Existing examples include `src/utils/passwordStrength.test.ts`, `src/store/slices/chatSlice.test.ts`, and `src/components/ui/EmptyState.test.tsx`.

## Environment And Mocks

The default environment is `jsdom`, including for non-UI tests. That provides browser globals for components and code using browser APIs. For a test file that specifically needs Node rather than a DOM, put this directive at the top of the file:

```ts
// @vitest-environment node
```

Vitest globals (`describe`, `it`, `expect`, and lifecycle hooks) are enabled; explicit imports from `vitest` are also used in this repository and are preferred in new examples for clarity. Use `vi.mock()` at module scope to replace network services or other external dependencies, and `vi.fn()` for controllable functions. Reset mock call history in `beforeEach` with `vi.clearAllMocks()`. Avoid mocking the reducer or component under test. If a test changes environment variables, restore them after the test (or use Vitest's environment stubbing and undo it) so the next test is isolated.

## Slice Test Example

Create `src/store/slices/authSlice.test.ts` to exercise the reducer and a public action without involving a configured store or network:

```ts
import { describe, expect, it } from 'vitest';
import authReducer, { setToken } from './authSlice';

describe('authSlice', () => {
  it('stores a token and marks the user authenticated', () => {
    const state = authReducer(undefined, setToken('test-token'));

    expect(state.token).toBe('test-token');
    expect(state.isAuthenticated).toBe(true);
  });
});
```

## Component Test Example

Create `src/components/ui/EmptyState.test.tsx` to verify rendered content and a user action. Testing Library's `screen` queries roles and accessible names, while `fireEvent` triggers the button in this minimal example:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders its title and invokes its primary action', () => {
    const onClick = vi.fn();

    render(
      <EmptyState
        title="Nothing here"
        description="There are no items yet."
        action={{ label: 'Refresh', onClick }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

Run either example directly with `pnpm test -- <path-to-test>` or run all tests with `pnpm test`.

## Dependency Security Gate

Two automated checks guard the dependency tree.

### pnpm audit (CI)

The `ci` job in `.github/workflows/vercel.yml` runs `pnpm audit --audit-level=high --prod` after installing dependencies. Any vulnerability rated **high** or **critical** in production dependencies fails the build immediately. `moderate` and `low` findings are logged but do not block merging.

Run it locally before opening a PR:

```bash
pnpm audit          # high+critical prod deps (mirrors CI)
pnpm audit:full     # all severities, all deps
```

### Dependency Review (PRs only)

`.github/workflows/dependency-review.yml` uses `actions/dependency-review-action@v4` on every pull request. It checks:

- New or updated packages against the GitHub Advisory Database for **high** and **critical** CVEs.
- Introduced licenses against a deny-list: `GPL-2.0`, `GPL-3.0`, `AGPL-3.0`, `LGPL-2.1`, `LGPL-3.0`.

Results are posted as a PR comment summary automatically.

### Exception Process

If a flagged advisory or license cannot be remediated immediately:

1. Open an issue with the label **`dependency-exception`** describing the package, the advisory/license, and the risk assessment.
2. Get explicit sign-off (approval comment) from a maintainer.
3. Add the advisory GHSA identifier as an `.npmrc` `audit-exceptions[]` entry, or the PURL to the `allow-dependencies-licenses` list in `dependency-review.yml`.
4. Record the rationale in `docs/SECURITY_EXCEPTIONS.md` (create the file if it does not exist).

No credentials or secret values appear in audit output. The audit commands only access advisory metadata from the pnpm registry.

## GitHub Actions SHA Pinning

All third-party actions in `.github/workflows/` are pinned to immutable 40-character commit SHAs rather than mutable version tags. A trailing comment on each `uses:` line records the human-readable version for auditability:

```yaml
uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
```

This prevents a compromised or force-pushed upstream tag from silently changing the code that runs in CI (supply-chain attack surface documented in [SLSA](https://slsa.dev/)).

### Pinned actions and current versions

| Action | Pinned version | SHA |
|---|---|---|
| `actions/checkout` | v4.2.2 | `11bd71901bbe5b1630ceea73d27597364c9af683` |
| `actions/setup-node` | v4.4.0 | `49933ea5288caeca8642d1e84afbd3f7d6820020` |
| `pnpm/action-setup` | v4.0.0 | `fe02b34f77f8bc703788d5817da081398fad5dd2` |
| `actions/cache` | v4.2.3 | `5a3ec84eff668545956fd18022155c47e93e2684` |
| `actions/upload-artifact` | v4.6.2 | `ea165f8d65b6e75b540449e92b4886f43607fa02` |
| `actions/github-script` | v7.0.1 | `60a0d83039c74a4aee543508d2ffcb1c3799cdea` |
| `actions/dependency-review-action` | v4.6.0 | `ce3cf9537a52e8119d91fd484ab5b8a807627bf8` |

### Automated update mechanism

`.github/dependabot.yml` opens a weekly PR every Monday for any new action release. Dependabot updates both the SHA and the version comment in a single commit. The review process is:

1. Dependabot opens a PR with the new SHA and a link to the upstream release.
2. A maintainer reviews the release notes and verifies the changelog contains no unexpected changes.
3. The PR is merged after approval — the existing CI and dependency-review gates run against it automatically.

To verify a SHA manually before merging, resolve the tag via the GitHub API:

```bash
curl -s https://api.github.com/repos/<owner>/<repo>/git/ref/tags/<tag> \
  | jq .object.sha
```

For annotated tags, follow the returned object URL one level deeper (type `tag` → dereference to the `commit` SHA).
