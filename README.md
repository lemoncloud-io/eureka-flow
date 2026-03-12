<div align="center">

# Eureka Flow

### Visual Workflow Editor for Building Data Flow Pipelines

[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Nx](https://img.shields.io/badge/Nx-22-143055?style=for-the-badge&logo=nx&logoColor=white)](https://nx.dev/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

<br />

[**Live Demo**](https://flow.eureka.codes) · [Features](#features) · [Quick Start](#quick-start) · [Architecture](#architecture) · [Contributing](#contributing)

<br />

<img src="https://github.com/user-attachments/assets/placeholder" alt="Eureka Flow Demo" width="800" />

_Drag, connect, and execute - visual workflow building made simple_

</div>

---

## Overview

**Eureka Flow** is a powerful, browser-based visual workflow editor for creating and executing data processing pipelines. Build complex workflows by connecting pre-built blocks, execute them in real-time, and monitor execution status through WebSocket-based live updates.

### Try It Now

> Visit **[flow.eureka.codes](https://flow.eureka.codes)** to try Eureka Flow instantly.
>
> Get your API key from [Eureka Codes Console](https://console.eureka.codes) with just one click.

---

## Features

### Visual Workflow Editor

- **Drag-and-drop** node placement on an infinite canvas
- **Bezier curve** connections between nodes
- **Pan, zoom, and multi-select** for intuitive navigation
- **Touch gesture support** for tablet and mobile devices
- **Undo/Redo** with full history management
- **Auto-layout** algorithm for automatic node arrangement

### Block System

- **100+ pre-built blocks** organized by category (input, process, output)
- **Port-based data flow** with typed connections
- **Configurable block parameters** with live preview
- **Extensible block registry** for custom blocks

### Dual Execution Modes

- **Frontend blocks** — Execute directly in browser for instant feedback
- **Backend blocks** — Server-side execution for heavy computation
- **Real-time status tracking** — IDLE → READY → RUNNING → COMPLETED/ERROR

### Real-Time Updates

- **WebSocket integration** for live node execution notifications
- **Port data synchronization** with sequence numbering
- **Self-echo prevention** with smart debouncing

### Seamless API Key Integration

- **One-click API key generation** via [Eureka Codes Console](https://console.eureka.codes)
- **Secure postMessage-based** key transfer between console and editor
- **State validation** for enhanced security

### Developer Experience

- **Dark/Light theme** with system preference detection
- **Internationalization (i18n)** — English & Korean
- **Auto-save** with configurable toggle
- **LocalStorage caching** for session continuity

---

## Tech Stack

<table>
<tr>
<td><b>Category</b></td>
<td><b>Technology</b></td>
</tr>
<tr>
<td>Framework</td>
<td><img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React" /></td>
</tr>
<tr>
<td>Language</td>
<td><img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></td>
</tr>
<tr>
<td>Build Tool</td>
<td><img src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white" alt="Vite" /></td>
</tr>
<tr>
<td>Monorepo</td>
<td><img src="https://img.shields.io/badge/Nx-22-143055?logo=nx&logoColor=white" alt="Nx" /></td>
</tr>
<tr>
<td>State Management</td>
<td><img src="https://img.shields.io/badge/Zustand-5-brown?logo=npm" alt="Zustand" /></td>
</tr>
<tr>
<td>Server State</td>
<td><img src="https://img.shields.io/badge/TanStack_Query-5-FF4154?logo=reactquery&logoColor=white" alt="TanStack Query" /></td>
</tr>
<tr>
<td>Styling</td>
<td><img src="https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" /> <img src="https://img.shields.io/badge/shadcn/ui-black?logo=shadcnui&logoColor=white" alt="shadcn/ui" /></td>
</tr>
<tr>
<td>Testing</td>
<td><img src="https://img.shields.io/badge/Vitest-green?logo=vitest&logoColor=white" alt="Vitest" /></td>
</tr>
</table>

---

## Quick Start

### Prerequisites

- **Node.js 20+** (check `.nvmrc` for exact version)
- **Yarn 1.22+**

### Installation

```bash
# Clone the repository
git clone https://github.com/lemoncloud-io/eureka-flow.git
cd eureka-flow

# Install dependencies
yarn install

# Copy environment template
cp .env.example .env.local

# Start development server
yarn web:start
```

The app will be available at `http://localhost:3000`.

### Using the Live Service

1. Visit **[flow.eureka.codes](https://flow.eureka.codes)**
2. Click "Create New Key" to open the [Eureka Codes Console](https://console.eureka.codes)
3. Sign in and generate your API key
4. The key is automatically transferred back to Eureka Flow
5. Start building your workflows!

---

## Environment Variables

### Root `.env.local`

```bash
# Required: API endpoint for the flows backend
VITE_API_URL=http://localhost:8800
```

### App-specific `apps/web/.env.*`

```bash
# Environment identifier (DEV, PROD, LOCAL)
VITE_ENV=LOCAL

# Project name
VITE_PROJECT=FLOWS

# API endpoint for the flows backend
VITE_API_URL=http://localhost:8800

# WebSocket endpoint for real-time updates
VITE_WS_ENDPOINT=ws://localhost:8801

# Eureka Codes console URL for API key management
VITE_CODES_URL=https://console.eureka.codes
```

---

## Architecture

### Monorepo Structure

```
eureka-flow/
├── apps/
│   └── web/                    # React web application
├── libs/
│   ├── flows/                  # Flow editor core (API, hooks, stores, types)
│   ├── socket/                 # WebSocket layer for real-time updates
│   ├── web-core/               # HTTP client, auth state, error handling
│   ├── ui-kit/                 # 33 shadcn/ui components (Radix UI)
│   ├── shared/                 # Common components (ErrorFallback, ApiKeyDialog)
│   └── theme/                  # Dark/light theme provider
├── scripts/                    # Build and deployment scripts
└── .github/                    # CI/CD workflows
```

### State Architecture

Four Zustand stores manage different concerns:

| Store               | Purpose                                            |
| ------------------- | -------------------------------------------------- |
| `useCanvasStore`    | Canvas UI: nodes, connections, viewport, selection |
| `useFlowsStore`     | Flow metadata: blockRegistry, flowName, saveStatus |
| `useWebSocketStore` | WebSocket: connectionStatus, subscribers           |
| `useWebCoreStore`   | Auth: apiKey, isAuthenticated, profile             |

### Data Flow

```
FlowEditorPage (orchestrator)
├── useFlows hook (flow CRUD operations)
├── useBlocks hook (block registry loading)
├── useInitFlowSocket hook (WebSocket callbacks)
│
├── Header (file operations, save status)
├── Sidebar (block library by category)
├── WorkflowCanvas (imperative canvas ref)
│   ├── NodeBlock (execution status display)
│   ├── ConnectionLine (SVG bezier curves)
│   └── useCanvasStore (nodes, connections)
└── DetailPanel (selected node configuration)
```

### API Key Flow

```
┌─────────────────────┐     postMessage      ┌──────────────────────┐
│    Eureka Flow      │ ◄──────────────────► │   Eureka Codes       │
│ (flow.eureka.codes) │      (API Key)       │(console.eureka.codes)│
└─────────────────────┘                       └──────────────────────┘
         │                                              │
         │ 1. Click "Create New Key"                    │
         │ ─────────────────────────────────────────────►
         │                                              │
         │                          2. User signs in    │
         │                             & creates key    │
         │                                              │
         │ 3. API key sent via postMessage              │
         │ ◄─────────────────────────────────────────────
         │                                              │
         │ 4. State validation for security             │
         │                                              │
         ▼
   Key stored locally
   Ready to use!
```

### Path Aliases

```typescript
@flows/flows      // libs/flows/src/index.ts
@flows/socket     // libs/socket/src/index.ts
@flows/web-core   // libs/web-core/src/index.ts
@flows/ui-kit     // libs/ui-kit/src/index.ts
@flows/shared     // libs/shared/src/index.ts
@flows/theme      // libs/theme/src/index.ts
@flows/lib/utils  // libs/ui-kit/src/utils/index.ts
```

---

## Development

### Available Commands

```bash
# Development
yarn web:start          # Start dev server on port 3000
yarn lint               # Run ESLint
yarn lint:fix           # Run ESLint with auto-fix
yarn prettier           # Format code with Prettier

# Build
yarn web:build          # Build for production
yarn web:build:dev      # Build for development environment
yarn web:build:prod     # Build for production environment

# Testing
yarn web:test           # Run tests

# Utilities
yarn clean:cache        # Clear build caches
yarn graph              # View Nx dependency graph
```

### Code Style

- **Named exports only** (no default exports)
- **Arrow functions**: `const fn = (): Type => {}`
- **4-space indentation**, single quotes, ES5 trailing commas
- **TypeScript strict mode** enabled
- **ESLint** enforces import ordering

### Import Organization

ESLint enforces strict ordering:

1. React and external libraries
2. Internal `@flows/*` packages
3. Relative imports
4. Type imports (separate section)

---

## API Integration

Eureka Flow requires a backend API for full functionality. Key endpoints:

| Endpoint               | Purpose                                |
| ---------------------- | -------------------------------------- |
| `GET /flows/:id/load`  | Load flow with nodes, edges, channelId |
| `POST /flows/:id/save` | Save flow (id='0' creates new)         |
| `POST /nodes/:id/run`  | Execute node                           |
| `GET /blocks/0/list`   | Load block definitions                 |

### Authentication

The app uses API key-based authentication:

- API key is stored in `useWebCoreStore` and localStorage
- Requests include `x-api-key` header
- 403 responses trigger API key dialog
- Keys can be generated via [Eureka Codes Console](https://console.eureka.codes)

---

## Deployment

### Build for Production

```bash
# Build with production configuration
yarn web:build:prod

# Output will be in dist/apps/web/
```

### Environment-Specific Builds

```bash
# Development build (connects to dev API)
yarn web:build:dev

# Production build (connects to prod API)
yarn web:build:prod
```

### Local Deployment Setup

For local deployment to AWS S3/CloudFront, create environment files from the template:

```bash
# Copy the example file
cp apps/web/.env.example apps/web/.env.dev    # For DEV deployment
cp apps/web/.env.example apps/web/.env.prod   # For PROD deployment
```

Edit the files with actual values (see `apps/web/.env.example` for reference).

**Required environment variables:**

| Variable           | Description                              |
| ------------------ | ---------------------------------------- |
| `VITE_ENV`         | Environment identifier (`DEV` or `PROD`) |
| `VITE_PROJECT`     | Project name (`FLOWS`)                   |
| `VITE_API_URL`     | API endpoint URL                         |
| `VITE_WS_ENDPOINT` | WebSocket endpoint URL                   |
| `VITE_CODES_URL`   | Eureka Codes console URL                 |

**AWS configuration** (create `.env.deploy` from `.env.deploy.example`):

```bash
# Copy the example file
cp .env.deploy.example .env.deploy
```

| Variable                  | Description                          |
| ------------------------- | ------------------------------------ |
| `AWS_PROFILE_NAME`        | AWS CLI profile name (e.g., `lemon`) |
| `BUCKET_NAME`             | S3 bucket name for deployment        |
| `DEV_CF_DISTRIBUTION_ID`  | CloudFront distribution ID for DEV   |
| `PROD_CF_DISTRIBUTION_ID` | CloudFront distribution ID for PROD  |

### Deployment Commands

```bash
# Deploy to development (uses .env.deploy for AWS config)
yarn web:deploy:dev

# Deploy to production (uses .env.deploy for AWS config)
yarn web:deploy:prod
```

### GitHub Actions Deployment

CI/CD is configured via GitHub Actions. The following secrets must be set in your repository:

| Secret                    | Description            |
| ------------------------- | ---------------------- |
| `AWS_ACCESS_KEY_ID`       | AWS access key         |
| `AWS_SECRET_ACCESS_KEY`   | AWS secret key         |
| `AWS_DEFAULT_REGION`      | AWS region             |
| `BUCKET_NAME`             | S3 bucket name         |
| `DEV_CF_DISTRIBUTION_ID`  | CloudFront ID for DEV  |
| `PROD_CF_DISTRIBUTION_ID` | CloudFront ID for PROD |
| `VITE_DEV_API_URL`        | DEV API URL            |
| `VITE_DEV_WS_ENDPOINT`    | DEV WebSocket URL      |
| `VITE_DEV_CODES_URL`      | DEV Eureka Codes URL   |
| `VITE_PROD_API_URL`       | PROD API URL           |
| `VITE_PROD_WS_ENDPOINT`   | PROD WebSocket URL     |
| `VITE_PROD_CODES_URL`     | PROD Eureka Codes URL  |

**Deployment triggers:**

- Push to `develop` branch → Deploy to DEV
- Push to `main` branch → Deploy to PROD

---

## Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Commit Message Format

```
type(scope): description

# Examples
feat(canvas): add node grouping functionality
fix(socket): resolve connection timeout issue
docs(readme): update installation instructions
```

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Related Projects

- **[Eureka Codes](https://console.eureka.codes)** — API key management and developer console
- **[Eureka Flows API](https://www.npmjs.com/package/@lemoncloud/eureka-flows-api)** — TypeScript types for the Flows API

---

<div align="center">

Made with :purple_heart: by [LemonCloud](https://github.com/lemoncloud-io)

[Website](https://lemoncloud.io) · [GitHub](https://github.com/lemoncloud-io)

</div>
