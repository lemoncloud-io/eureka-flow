# Contributing to Eureka Flow

Thank you for your interest in contributing to Eureka Flow! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js 18+
- Yarn (package manager)

### Setup

1. Fork the repository
2. Clone your fork:
    ```bash
    git clone https://github.com/YOUR_USERNAME/eureka-flow.git
    cd eureka-flow
    ```
3. Install dependencies:
    ```bash
    yarn install
    ```
4. Start the development server:
    ```bash
    yarn web:start
    ```

## Development Workflow

### Branch Naming

Use descriptive branch names with prefixes:

- `feature/` - New features (e.g., `feature/add-node-grouping`)
- `fix/` - Bug fixes (e.g., `fix/connection-rendering`)
- `docs/` - Documentation updates (e.g., `docs/api-reference`)
- `refactor/` - Code refactoring (e.g., `refactor/canvas-store`)

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]
```

Types:

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Code style (formatting, etc.)
- `refactor` - Code refactoring
- `test` - Adding tests
- `chore` - Maintenance tasks

Examples:

```
feat(canvas): add node grouping functionality
fix(socket): resolve reconnection issues
docs(readme): update installation instructions
```

### Code Style

- Run `yarn lint` before committing
- Run `yarn prettier` to format code
- Follow existing patterns in the codebase
- Use TypeScript strict mode
- Prefer named exports over default exports

### Testing

- Run `yarn web:test` to execute tests
- Add tests for new features
- Ensure existing tests pass

## Pull Request Process

1. Create a new branch from `develop`:

    ```bash
    git checkout develop
    git pull origin develop
    git checkout -b feature/your-feature
    ```

2. Make your changes and commit them

3. Push to your fork:

    ```bash
    git push origin feature/your-feature
    ```

4. Open a Pull Request against the `develop` branch

5. Fill out the PR template completely

6. Wait for review and address any feedback

### PR Guidelines

- Keep PRs focused and reasonably sized
- Include screenshots for UI changes
- Link related issues
- Ensure CI checks pass

## Project Structure

```
eureka-flow/
├── apps/
│   └── web/          # React web application
├── libs/
│   ├── flows/        # Flow editor logic, API, hooks, stores
│   ├── socket/       # WebSocket layer
│   ├── web-core/     # HTTP client, auth
│   ├── ui-kit/       # UI components (shadcn/ui)
│   ├── shared/       # Common components
│   └── theme/        # Theme provider
└── ...
```

## Code of Conduct

Please be respectful and inclusive in all interactions. We expect all contributors to:

- Use welcoming and inclusive language
- Be respectful of differing viewpoints
- Accept constructive criticism gracefully
- Focus on what is best for the community

## Questions?

- Open a [Discussion](https://github.com/lemoncloud-io/eureka-flow/discussions) for questions
- Check existing [Issues](https://github.com/lemoncloud-io/eureka-flow/issues) for known problems

Thank you for contributing!
