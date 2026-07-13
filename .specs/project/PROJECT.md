# order-messaging-lab

**Vision:** Laboratório de engenharia que implementa, de ponta a ponta, um fluxo de processamento de pedidos orientado a eventos, usando coreografia (sem orquestrador central) sobre arquitetura hexagonal (ports-and-adapters) em NestJS + TypeScript.
**For:** Time técnico/arquitetura validando padrões de sistemas distribuídos orientados a eventos antes de aplicá-los em produtos reais de e-commerce/marketplace.
**Solves:** Contaminação do domínio por detalhes de mensageria, ausência de idempotência, contratos de evento sem versionamento, falta de rastreabilidade fim a fim e acoplamento a broker específico — erros recorrentes em times que adotam arquitetura orientada a eventos.

## Goals

- Validar que a arquitetura hexagonal isola o domínio de infraestrutura de mensageria — métrica: 0 imports de SDK de SNS/SQS/RabbitMQ em `domain/` ou `application/` (lint de arquitetura bloqueante em CI desde a Fase 0).
- Validar portabilidade de broker (SNS/SQS → RabbitMQ) sem alterar domínio/aplicação — métrica: 0 alterações em `domain/`/`application/` ao trocar `MESSAGING_PROVIDER` na Fase 2.
- Validar idempotência, retry/backoff e DLQ em fluxo multi-subdomínio — métrica: 0 efeitos colaterais duplicados em 100 reenvios simulados (Fase 1).
- Produzir base de código de referência (contratos, testes, documentação) reutilizável para outros laboratórios.

## Tech Stack

**Core:**

- Framework: NestJS (TypeScript)
- Language: TypeScript
- Database: PostgreSQL (via TypeORM), com adapter in-memory para dev/teste sem infra externa
- Messaging: SNS/SQS (Fase 1, via LocalStack em dev/teste) → RabbitMQ intercambiável (Fase 2, via Testcontainers)

**Key dependencies:** `class-validator`/`class-transformer` (validação de DTO), `@nestjs/typeorm` + `typeorm` (persistência), `zod` ou `class-validator` (validação de schema de evento), `dependency-cruiser` ou ESLint boundaries (lint de arquitetura), Jest + Testcontainers/LocalStack (testes).

## Scope

**v1 includes (3 fases incrementais):**

- Fase 0 — domínio `Order`, caso de uso `CreateOrder`, API síncrona `POST /orders` (+ `GET /orders/:id`), persistência in-memory e Postgres, estrutura hexagonal por subdomínio, lint de arquitetura bloqueante em CI.
- Fase 1 — fluxo assíncrono completo via SNS/SQS (Order → Stock → Payment → Stock → Notification), idempotência, retry/DLQ, observabilidade, testes de integração via LocalStack.
- Fase 2 — adapter RabbitMQ intercambiável via `MESSAGING_PROVIDER`, testes de contrato duplicados, documentação de trade-offs SNS/SQS vs RabbitMQ.

**Explicitly out of scope:**

- Saga completa com rollback/compensação automática (liberação de reserva, cancelamento).
- Frontend/UI; autenticação de usuário final completa (login/cadastro) — apenas API Key/JWT de serviço.
- Gateway de pagamento real (Payment é sempre mock).
- Deploy em produção real, SLA comercial, multi-broker simultâneo em produção.
- Cancelamento de pedido, timeout ativo entre etapas, reprocessamento manual de DLQ via UI (Backlog Futuro).

## Constraints

- Timeline: sem datas fixas de calendário; roadmap incremental por fase (ver PRD seção 10.1).
- Technical: ambiente de dev local depende de Docker (LocalStack, Testcontainers, RabbitMQ); garantia de entrega assumida é "at-least-once" em ambos os brokers, nunca "exactly-once" nativo.
- Resources: time com familiaridade prévia em NestJS/TypeScript (sem onboarding básico de stack).

## Decisões abertas resolvidas para a Fase 0

- Persistência Postgres: **TypeORM**.
- `GET /orders/:id` (projeção de leitura): **incluído já na Fase 0** (PRD pergunta aberta #2).
- Lint de arquitetura bloqueante em CI: **desde a Fase 0** (PRD pergunta aberta #7).
- Estrutura de módulos: Fase 0 cria apenas o subdomínio `order` completo (domain/application/infrastructure); `payment`, `stock`, `notification` entram na Fase 1.
