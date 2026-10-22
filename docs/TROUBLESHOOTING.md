# Local Setup Troubleshooting Guide

This guide covers common setup failures, environmental errors, socket disconnects, and backend proxy issues encountered when running Chenpilot Client locally.

---

## Table of Contents

1. [Environment & Configuration Failures](#1-environment--configuration-failures)
   - [Missing `NEXT_PUBLIC_API_BASE_URL`](#missing-next_public_api_base_url)
   - [Wrong Backend Port / Network Connection Refused](#wrong-backend-port--network-connection-refused)
   - [`/horizon` Proxy Request Failures (502 / 504 / 404)](#horizon-proxy-request-failures-502--504--404)
2. [Git Hooks & Husky Failures](#2-git-hooks--husky-failures)
   - [Husky Hooks Not Running or Pre-Commit Failures](#husky-hooks-not-running-or-pre-commit-failures)
3. [Socket.io Connection Failures](#3-socketio-connection-failures)
   - [Socket Connection Failed / Continuous Reconnect Loop](#socket-connection-failed--continuous-reconnect-loop)

---

## 1. Environment & Configuration Failures

### Missing `NEXT_PUBLIC_API_BASE_URL`

* **Symptom**: Application fails to start or throws an unhandled exception at import time:
  ```
  Error: [Env Config Error] Missing required environment variable(s): NEXT_PUBLIC_API_BASE_URL.
  ```
* **Cause**: `.env.local` is missing or does not define `NEXT_PUBLIC_API_BASE_URL`.
* **Exact Fix Commands**:
  Copy the example environment file to `.env.local` and set `NEXT_PUBLIC_API_BASE_URL`:
  ```bash
  cp .env.example .env.local
  ```
  Ensure `.env.local` contains:
  ```env
  NEXT_PUBLIC_API_BASE_URL=http://localhost:2333
  ```

---

### Wrong Backend Port / Network Connection Refused

* **Symptom**: Browser console or terminal shows `ERR_CONNECTION_REFUSED` or `axios` 500/502 errors when sending queries or logging in.
* **Cause**: `NEXT_PUBLIC_API_BASE_URL` points to a port where the backend is not running (e.g., pointing to port 3000 instead of port 2333).
* **Exact Fix Commands**:
  1. Verify the backend port in your backend environment configuration or startup logs.
  2. Verify backend status on port 2333:
     ```bash
     curl http://localhost:2333/
     ```
  3. Update `.env.local` in `chenpilot-client`:
     ```env
     NEXT_PUBLIC_API_BASE_URL=http://localhost:2333
     ```
  4. Restart the development server:
     ```bash
     pnpm dev
     ```

---

### `/horizon` Proxy Request Failures (502 / 504 / 404)

* **Symptom**: Stellar Horizon blockchain calls through `/horizon` fail with HTTP 502 Bad Gateway or 404 Not Found.
* **Cause**: Next.js proxy route `/horizon` cannot forward requests because the underlying Stellar Horizon network node or backend proxy handler is down or unreachable.
* **Exact Fix Commands**:
  1. Verify Stellar Horizon testnet connectivity directly:
     ```bash
     curl https://horizon-testnet.stellar.org/
     ```
  2. Check your backend status to ensure the backend proxy endpoint is running:
     ```bash
     curl http://localhost:2333/proxy/horizon
     ```
  3. Clear Next.js cache and restart the client dev server:
     ```bash
     rm -rf .next
     pnpm dev
     ```

---

## 2. Git Hooks & Husky Failures

### Husky Hooks Not Running or Pre-Commit Failures

* **Symptom**: Git commits fail with `.husky/pre-commit: line 2: eslint: command not found` or Husky hooks fail to trigger.
* **Cause**: Git hooks were not initialized during `pnpm install` or binary execution permissions are missing on `.husky/pre-commit`.
* **Exact Fix Commands**:
  1. Reinstall and re-initialize Husky hooks:
     ```bash
     pnpm prepare
     ```
  2. Grant executable permissions to Husky scripts (Linux/macOS/Git Bash):
     ```bash
     chmod +x .husky/pre-commit
     ```
  3. Verify staged files pass linting manually:
     ```bash
     pnpm lint
     ```
  4. (Emergency only) Skip hooks if resolving an urgent hotfix:
     ```bash
     git commit --no-verify -m "your commit message"
     ```

---

## 3. Socket.io Connection Failures

### Socket Connection Failed / Continuous Reconnect Loop

* **Symptom**: UI shows offline indicator banner, or browser console continuously logs `[SocketManager] Connection error` or fallback polling loops.
* **Cause**: The Socket.io backend server is not running, blocked by CORS rules, or running on an mismatched host/port.
* **Exact Fix Commands**:
  1. Check if the WebSocket / Socket.io backend port is active:
     ```bash
     curl http://localhost:2333/socket.io/?EIO=4&transport=polling
     ```
  2. Verify backend socket server is running by starting the experimental backend service:
     ```bash
     cd ../chenpilot-experimental
     npm run dev
     ```
  3. Verify `NEXT_PUBLIC_API_BASE_URL` in `.env.local` matches the backend host address.
