# Contributing to Atomsyn

Thank you for considering contributing to Atomsyn! This guide will help you get started.

## Table of Contents

- [Development Setup](#development-setup)
- [Branch Strategy](#branch-strategy)
- [Making Changes](#making-changes)
- [Commit Convention](#commit-convention)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Reporting Issues](#reporting-issues)

## Development Setup

### Prerequisites

- **Node.js** 22+ (LTS recommended)
- **Rust** toolchain via [rustup](https://rustup.rs/)
- **npm** (comes with Node.js)

### macOS additional requirements

```bash
xcode-select --install
```

### Linux additional requirements

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev libgtk-3-dev
```

### Getting started

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/YOUR_USERNAME/AtomSyn.git
cd AtomSyn
npm install

# Run the development server
npm run dev          # Web mode at http://localhost:5173
npm run tauri:dev    # Desktop mode (requires Rust)

# Verify everything works
npm run lint         # TypeScript check
npm run build        # Full production build
npm run test:cli     # CLI regression tests
```

## Branch Strategy

- `main` — Stable release branch. All PRs target this branch.
- Feature branches — Use descriptive names: `feat/skill-map-filter`, `fix/atom-sidebar-crash`

## Making Changes

1. **Fork** the repository and create your branch from `main`
2. **Make your changes** — keep PRs focused on a single concern
3. **Test locally** — run `npm run lint` and `npm run build` at minimum
4. **Commit** using our commit convention (see below)
5. **Push** to your fork and open a Pull Request

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

### Types

| Type | When to use |
|---|---|
| `feat` | New feature or functionality |
| `fix` | Bug fix |
| `docs` | Documentation changes only |
| `style` | Formatting, missing semicolons, etc. (no code change) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Build process, tooling, dependencies |

### Scopes

Common scopes: `gui`, `cli`, `api`, `tauri`, `skill`, `data`

### Examples

```
feat(gui): add filter by role in Atom Garden
fix(cli): handle missing taxonomy directory on first run
docs: update README with Homebrew installation
chore(deps): bump tauri to 2.11
```

## Pull Request Process

1. Fill out the PR template completely
2. Ensure CI passes (lint, build, cargo check, CLI tests)
3. Keep the PR description clear — explain **what** changed and **why**
4. Link related issues using `Closes #123` or `Fixes #123`
5. Be responsive to review feedback
6. Squash-merge is preferred for clean history

### PR Size Guidelines

- **Small** (< 200 lines): Bug fixes, small features — fast review
- **Medium** (200-500 lines): New features with tests — normal review
- **Large** (500+ lines): Consider splitting into smaller PRs

## Code Style

### TypeScript / React

- Strict TypeScript — no `any` unless absolutely necessary
- Functional components with hooks
- Use existing utilities from `src/lib/` before creating new ones
- TailwindCSS for styling — avoid inline styles
- Follow existing patterns in the codebase

### Rust (src-tauri)

- Follow standard Rust conventions (`cargo fmt`, `cargo clippy`)
- Keep Tauri commands thin — delegate logic to separate modules

### Data Files

- All JSON files must validate against schemas in `skills/schemas/`
- Never modify `data/index/` manually — it's auto-generated
- Atom IDs follow the pattern: `atom_<slug>` or `atom_exp_<slug>_<timestamp>`

## Reporting Issues

### Bug Reports

Please include:
- Steps to reproduce
- Expected vs actual behavior
- Platform and OS version
- App version (from Settings page)
- Console logs if applicable

### Feature Requests

Please include:
- Problem you're trying to solve
- Proposed solution
- Alternative approaches you've considered

## Questions?

Open a [Discussion](https://github.com/lihuan6015-droid/AtomSyn/discussions) for questions that aren't bugs or feature requests.

---

Thank you for helping make Atomsyn better!
