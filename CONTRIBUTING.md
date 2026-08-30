# Contributing

Thank you for helping improve aeokit.

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Development

Use Node 24 and pnpm 10, then run:

```sh
corepack enable
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Before opening a pull request, run:

```sh
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm audit
```

Keep pull requests focused, include tests for behavior changes, and document
new environment variables. Do not commit provider keys or raw user data.

By contributing, you agree that your contribution is licensed under
`AGPL-3.0-only`, the license used by the aeokit core in this repository.

Use [GitHub Discussions](https://github.com/aeokit-dev/aeokit/discussions) for
usage questions. Report security issues using [SECURITY.md](SECURITY.md), not a
public issue.
