# Contributing to Apex Family Tree

Thank you for your interest in contributing to Apex Family Tree! This guide will help you get started.

---

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/Apex-Family-Tree.git
   cd Apex-Family-Tree
   ```
3. **Set up your development environment** — see the [Development Setup Guide](Docs/Guides/Development-Setup.md)
4. **Create a branch** for your changes (see [Branch Naming](#branch-naming) below)

---

## Development Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Run linting and tests:
   ```bash
   npm run lint
   npm run test
   ```
4. Format your code:
   ```bash
   npm run format
   ```
5. Commit your changes (see [Commit Conventions](#commit-conventions))
6. Push to your fork and open a Pull Request

---

## Branch Naming

Use descriptive branch names with a type prefix:

| Prefix | Purpose | Example |
|---|---|---|
| `feature/` | New features | `feature/timeline-view` |
| `fix/` | Bug fixes | `fix/login-redirect-loop` |
| `docs/` | Documentation changes | `docs/api-reference` |
| `refactor/` | Code restructuring | `refactor/auth-middleware` |
| `test/` | Test additions or fixes | `test/gedcom-import` |
| `chore/` | Maintenance tasks | `chore/update-dependencies` |

---

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes only |
| `style` | Formatting, white-space (no logic changes) |
| `refactor` | Code restructuring (no feature/fix) |
| `test` | Adding or updating tests |
| `chore` | Build process, dependency updates |
| `perf` | Performance improvements |

### Examples

```
feat(gedcom): add GEDCOM 7.0 export support

fix(auth): prevent refresh token reuse after logout

docs: update API reference with media endpoints

chore: upgrade React to 18.3
```

---

## Pull Request Checklist

Before submitting a PR, please ensure:

- [ ] Code compiles without errors (`npm run build`)
- [ ] All existing tests pass (`npm run test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Code is formatted (`npm run format:check`)
- [ ] New features include appropriate tests
- [ ] Documentation is updated if applicable
- [ ] Commit messages follow conventional commits
- [ ] PR description explains what changes were made and why

---

## Code Style

### Tools

- **ESLint 9** (flat config) — `eslint.config.js`
- **Prettier** — `.prettierrc`

Both run automatically via the `lint` and `format` scripts.

### TypeScript

- Strict mode is enabled
- Use `@/` path alias for imports from `src/`
- Backend: use `.js` file extensions in import paths (ESM requirement)
- Frontend: no file extensions needed (Vite resolves them)

### CSS

- Use **CSS Modules** for component styles (`.module.css`)
- Reference design tokens from `styles/tokens.css`
- Avoid inline styles

---

## Testing

- **Framework**: Vitest + Testing Library
- Run all tests: `npm run test`
- Run workspace tests:
  ```bash
  npm run test -w frontend
  npm run test -w backend
  ```

When adding new features, include tests that cover:
- Happy path behavior
- Edge cases and error handling
- Role-based access (if the feature has auth requirements)

---

## Reporting Issues

When reporting bugs, please include:

1. Steps to reproduce
2. Expected behavior
3. Actual behavior
4. Browser/OS version (for frontend issues)
5. Docker version and logs (for deployment issues)

Use [GitHub Issues](https://github.com/tokendad/Apex-Family-Tree/issues) to report bugs or request features.

---

## Questions?

- Open a [Discussion](https://github.com/tokendad/Apex-Family-Tree/discussions) for questions and ideas
- Check existing issues and discussions before creating new ones
