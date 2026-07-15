# Roadmap — order-messaging-lab

## Fase 0 — Fundação de domínio + API de criação de pedido

**Objetivo técnico:** estabelecer domínio (entities, value objects, casos de uso), portas e primeiro adapter HTTP; sem mensageria.
**Critério de saída:** `POST /orders` cria um pedido válido, persiste e retorna 201; `GET /orders/:id` retorna o pedido; testes unitários passando; sem dependência de mensageria.
**Status:** ✅ Concluída (2026-07-14). 22 tasks implementadas (T1-T22), Verificador independente: PASS (54 testes, 0 falhas, lint de arquitetura 0 violações). Ver `.specs/features/domain-foundation/validation.md`.
**Regra de deploy (AWS):** o deploy público desta fase segue o padrão de `aws-reference.md` (ECS Fargate + ALB + API Gateway HTTP API + ECR/OIDC via GitHub Actions), estendido com RDS Postgres + Secrets Manager (não cobertos pela referência) — ver `.specs/features/aws-deploy/`. Não é replicação literal: IaC vive neste mesmo repo (mono-repo), não em repo de IaC separado como no exemplo da referência (decisão registrada em `aws-deploy/context.md`).

## Fase 1 — Mensageria com SNS/SQS e fluxo assíncrono completo

**Objetivo técnico:** coreografia via SNS/SQS; publishers/consumers desacoplados; idempotência; DLQ; observabilidade.
**Critério de saída:** pedido percorre reserva → pagamento → baixa → notificação de forma assíncrona; idempotência comprovada; DLQ funcional.
**Status:** Em especificação (M0 concluído — desbloqueada).
**Regra de deploy (AWS) — proposta, sujeita a confirmação:** SNS/SQS e Redis (idempotency store, AD-010) não têm equivalente em `aws-reference.md` (a referência só cobre compute/rede/API); a topologia de monólito modular já decidida (STATE.md) significa que essa fase **não** introduz novo ALB/API Gateway/Fargate Service — reaproveita a mesma Fargate Service do `order-service`. Trade-off a decidir junto ao Design da fase: (a) provisionar SNS/SQS/Redis como uma nova stack CDK dedicada (ex. `MessagingStack`), seguindo o mesmo espírito de least-privilege IAM e tags de custo da referência, vs. (b) Redis gerenciado (ElastiCache) vs. container próprio no mesmo cluster ECS — avaliar custo/complexidade antes de fixar.

## Fase 2 — RabbitMQ como adapter intercambiável

**Objetivo técnico:** adapter RabbitMQ via portas `MessagePublisher`/`MessageConsumer`, sem tocar domínio/aplicação.
**Critério de saída:** fluxo completo roda sem alteração de código de domínio/aplicação ao trocar `MESSAGING_PROVIDER`; testes de contrato passam em ambos adapters.
**Status:** Não iniciado. Depende de M1.
**Regra de deploy (AWS) — proposta, sujeita a confirmação:** RabbitMQ precisa de um broker rodando em algum lugar — a referência não cobre isso. Trade-off a decidir junto ao Design da fase: (a) self-hosted RabbitMQ como novo serviço Fargate no mesmo cluster ECS, seguindo o molde de "stack de serviço" da referência (task definition, security group restrito à VPC, sem exposição direta à internet), vs. (b) Amazon MQ (broker RabbitMQ gerenciado) — menos operação manual, mas foge do padrão "recursos self-hosted no ECS" usado até aqui. Analisar junto ao usuário antes de iniciar a Fase 2.

## Milestones

| Marco | Critério | Dependência |
|---|---|---|
| M0 — Domínio fundacional pronto | DoD Fase 0 | ✅ Atingido (2026-07-14) |
| M1 — Fluxo assíncrono funcional | DoD Fase 1 (incl. exceções) | M0 |
| M2 — Broker intercambiável comprovado | DoD Fase 2 | M1 |

## Perguntas em aberto ainda não resolvidas (PRD seção 12)

- #1 Payment: recusa determinística vs probabilística — decidir no spec da Fase 1.
- #3 SLA de "pedido estagnado" — decidir no spec da Fase 1 (observabilidade).
- #4 Idempotency store compartilhada (Redis) vs isolada por subdomínio — decidir no spec da Fase 1.
- #5 Fase 1 e Fase 2 lado a lado ou substituição — decidir ao iniciar Fase 2.
- #6 Retenção de `processed_events` — decidir no spec da Fase 1.
