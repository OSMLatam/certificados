# Contributing

## Prerequisites

- Node.js 22 LTS
- pnpm 9+
- Docker & Docker Compose

## Setup

```bash
cp docs/anexos/.env.example .env
docker compose up -d postgres minio redis
pnpm install
pnpm --filter api prisma migrate dev
pnpm --filter api prisma db seed
pnpm dev
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | API + web in development |
| `pnpm test` | Unit + integration tests |
| `pnpm lint` | ESLint + Prettier check |
| `pnpm build` | Production build |

## Code style

- TypeScript strict mode
- ESLint + Prettier (configs in repo root)
- Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`
- Comments in English; user-facing strings in Spanish

## Architecture

Read before coding:

- [docs/09-plan-de-implementacion.md](docs/09-plan-de-implementacion.md) — phases
- [docs/10-diseno-codigo-y-anexos.md](docs/10-diseno-codigo-y-anexos.md) — structure, ENV, modules

## Pull requests

1. Branch from `main`
2. Tests pass locally (`pnpm test`)
3. One phase scope per PR when possible
4. Update `openapi.yaml` if API changes

## License

By contributing, you agree that:

- **Source code** and non-docs project files are licensed under the [MIT License](LICENSE).
- **Documentation** under `docs/` is licensed under [CC BY 4.0](LICENSE-DOCS).

See [LICENSE](LICENSE) for the dual-license notice. Trademarks and logos are not covered.
