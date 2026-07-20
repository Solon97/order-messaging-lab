# order-messaging-lab

Laboratório de engenharia que implementa, de ponta a ponta, um fluxo de processamento de pedidos orientado a eventos, usando coreografia (sem orquestrador central) sobre arquitetura hexagonal (ports-and-adapters) em NestJS + TypeScript.

O objetivo não é construir um produto, mas validar — com código real e testado — padrões de sistemas distribuídos orientados a eventos: isolamento do domínio em relação à mensageria, portabilidade de broker, idempotência/retry/DLQ e rastreabilidade fim a fim.

## Stack

- **Framework:** NestJS (TypeScript)
- **Persistência:** PostgreSQL via TypeORM (uma instância, um schema por subdomínio) — com adapter in-memory alternável para dev/teste sem infra externa
- **Autenticação:** AWS Cognito (JWT), com guard `NONE` alternável para dev local
- **Infraestrutura:** AWS CDK (`infra/`) — VPC, RDS, ECS Fargate, Cognito, CloudFront, bastion
- **Mensageria (roadmap):** SNS/SQS (Fase 1) → RabbitMQ intercambiável via `MESSAGING_PROVIDER` (Fase 2)

## Arquitetura

Monólito modular: um único processo NestJS com subdomínios isolados por pasta sob `src/`, cada um estruturado em hexagonal (ports-and-adapters):

```
src/<subdominio>/
├── domain/           # entidades, value objects, erros — sem dependência de framework/infra
├── application/       # casos de uso, portas (interfaces) de repositório
└── infrastructure/    # adapters HTTP, persistência (TypeORM/in-memory)
```

Regra de arquitetura bloqueante em CI (`npm run lint:arch`, via `dependency-cruiser`): **zero imports de SDK de mensageria (SNS/SQS/RabbitMQ) em `domain/` ou `application/`**.

Subdomínio implementado até o momento: `order` (`POST /orders`, `GET /orders/:id`). `payment`, `stock` e `notification` entram nas fases seguintes do roadmap (ver `.specs/project/PRD.md` e `.specs/project/ROADMAP.md`).

## Rodando localmente

```bash
npm install

# desenvolvimento (watch mode)
npm run start:dev
```

A API sobe em `http://localhost:3000` (ou na porta definida em `PORT`). Documentação OpenAPI/Swagger disponível em `/api-docs`.

### Variáveis de ambiente

| Variável | Valores | Padrão | Descrição |
|---|---|---|---|
| `PORT` | número | `3000` | Porta HTTP |
| `PERSISTENCE_PROVIDER` | `POSTGRES` \| `IN_MEMORY` | `POSTGRES` | Adapter de persistência do subdomínio `order` |
| `DATABASE_URL` | connection string | — | Necessária quando `PERSISTENCE_PROVIDER=POSTGRES` |
| `DATABASE_SSL` | `true` \| `false` | `false` | Habilita SSL na conexão com o Postgres |
| `AUTH_PROVIDER` | `COGNITO` \| `NONE` | `COGNITO` | `NONE` desativa autenticação (uso local/dev) |
| `COGNITO_USER_POOL_ID` | string | — | Necessária quando `AUTH_PROVIDER=COGNITO` |
| `COGNITO_CLIENT_ID` | string | — | Necessária quando `AUTH_PROVIDER=COGNITO` |

Para rodar sem dependências externas: `PERSISTENCE_PROVIDER=IN_MEMORY AUTH_PROVIDER=NONE npm run start:dev`.

## Testes

```bash
npm run test        # testes unitários
npm run test:cov     # cobertura (mínimo 80% em domain/order)
npm run test:e2e      # testes e2e
npm run lint:arch     # lint de arquitetura (fronteiras entre domain/application/infrastructure)
```

## Infraestrutura e deploy

O deploy em AWS (CDK: `FoundationStack`, `NetworkStack`, `AuthStack`, `DatabaseStack`, `ComputeStack`, `BastionStack`, `EdgeStack`) e os workflows de CI/CD vivem em [`infra/`](infra/README.md) e [`.github/workflows/`](.github/workflows). Consulte o runbook em `infra/README.md` para o passo a passo de provisionamento.

## Documentação do projeto

Especificações, decisões arquiteturais e roadmap seguem o fluxo spec-driven em `.specs/`:

- [`.specs/project/PROJECT.md`](.specs/project/PROJECT.md) — visão, objetivos, escopo e stack
- [`.specs/project/PRD.md`](.specs/project/PRD.md) — requisitos detalhados
- [`.specs/project/ROADMAP.md`](.specs/project/ROADMAP.md) — fases e sequenciamento
- [`.specs/project/STATE.md`](.specs/project/STATE.md) — log de decisões e estado atual
- [`.specs/features/`](.specs/features) — spec/design/tasks/validation por feature