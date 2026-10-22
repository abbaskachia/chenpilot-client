# ChenPilot Client

A modern, responsive web client for **ChenPilot** - a crypto wallet management system with AI agent capabilities. Built with Next.js, TypeScript, and Tailwind CSS.

## Getting Started

> 💡 **Troubleshooting**: Having issues setting up locally? Check out our [Troubleshooting Guide](./docs/TROUBLESHOOTING.md) for solutions to common environment, port, socket, and git hook problems.

### Prerequisites

- Node.js 18+
- pnpm

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd chenpilot-client
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables**

   Create a `.env.local` file in the project root:

   ```env
   NEXT_PUBLIC_API_BASE_URL=http://localhost:2333
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
   NEXT_PUBLIC_APP_NAME=ChenPilot
   NEXT_PUBLIC_APP_VERSION=1.0.0
   ```

   Refer to [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) if you encounter environment setup issues.

4. **Start the development server**

   ```bash
   pnpm dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm lint:fix` - Run ESLint and fix issues automatically
- `pnpm typecheck` - Run TypeScript type checking
- [`pnpm test`](docs/TESTING.md) - Run the Vitest suite once
- `pnpm test:watch` - Run Vitest in watch mode
- `pnpm test:coverage` - Run tests and generate coverage report

## CI/CD Pipeline

This project uses GitHub Actions for continuous integration and deployment to Vercel.

### GitHub Secrets Configuration

Before the CI/CD pipeline can run, configure the following secrets in your GitHub repository:

1. Navigate to **Settings** → **Secrets and variables** → **Actions**
2. Add the following repository secrets:

| Secret Name         | Description            | How to Obtain                                                                         |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `VERCEL_TOKEN`      | Vercel API token       | Go to [Vercel Account Settings](https://vercel.com/account/tokens) → Create new token |
| `VERCEL_ORG_ID`     | Vercel organization ID | Run `vercel link` in your project, then check `.vercel/project.json`                  |
| `VERCEL_PROJECT_ID` | Vercel project ID      | Run `vercel link` in your project, then check `.vercel/project.json`                  |

### Workflow Behavior

**On Pull Requests:**

- Runs CI checks (install, lint, build)
- Creates a Vercel preview deployment
- Comments the preview URL on the PR
- Blocks merge if any check fails

**On Push to Main:**

- Runs CI checks (install, lint, build)
- Deploys to Vercel production
- Updates deployment summary

### CI Checks

All deployments require passing:

1. ✅ Dependency installation (`pnpm install --frozen-lockfile`)
2. ✅ Linting (`pnpm lint`)
3. ✅ Build (`pnpm build`)
4. ✅ Tests (`pnpm test`)

## Git Hooks (Husky)

This project uses Husky to enforce code quality before commits.

### Automatic Setup

Husky hooks are automatically installed when you run:

```bash
pnpm install
```

The `prepare` script in `package.json` handles the installation.

### Pre-commit Hook

Before each commit, the following checks run automatically:

- **Linting**: ESLint runs on all staged `.js`, `.jsx`, `.ts`, `.tsx` files
- **Auto-fix**: ESLint will attempt to fix issues automatically
- **Commit blocking**: If linting fails, the commit is blocked

### Troubleshooting Husky

**Hooks not running?**

```bash
# Reinstall hooks
pnpm exec husky install

# Check hook permissions
chmod +x .husky/pre-commit
```

For more detailed failure modes, see [Troubleshooting Guide](./docs/TROUBLESHOOTING.md).

**Skip hooks (emergency only):**

```bash
git commit --no-verify -m "your message"
```

> ⚠️ **Note**: Skipping hooks should be rare. The CI pipeline will still enforce all checks.

### Environment Variables for Production

Ensure all required environment variables are set in your deployment platform.

## Contributing

For guidelines on contributing code, submitting Architectural Decision Records (ADRs), and code styles, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

This project is licensed under the MIT License.

## Support

For support and questions:

- Create an issue in the repository
- Check the [Troubleshooting Guide](./docs/TROUBLESHOOTING.md) and documentation
- Contact the development team

---

Built with love by the ChenPilot Team
