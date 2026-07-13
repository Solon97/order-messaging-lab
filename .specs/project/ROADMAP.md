# Roadmap — order-messaging-lab

## Fase 0 — Fundação de domínio + API de criação de pedido

**Objetivo técnico:** estabelecer domínio (entities, value objects, casos de uso), portas e primeiro adapter HTTP; sem mensageria.
**Critério de saída:** `POST /orders` cria um pedido válido, persiste e retorna 201; `GET /orders/:id` retorna o pedido; testes unitários passando; sem dependência de mensageria.
**Status:** Em especificação.

## Fase 1 — Mensageria com SNS/SQS e fluxo assíncrono completo

**Objetivo técnico:** coreografia via SNS/SQS; publishers/consumers desacoplados; idempotência; DLQ; observabilidade.
**Critério de saída:** pedido percorre reserva → pagamento → baixa → notificação de forma assíncrona; idempotência comprovada; DLQ funcional.
**Status:** Não iniciado. Depende de M0.

## Fase 2 — RabbitMQ como adapter intercambiável

**Objetivo técnico:** adapter RabbitMQ via portas `MessagePublisher`/`MessageConsumer`, sem tocar domínio/aplicação.
**Critério de saída:** fluxo completo roda sem alteração de código de domínio/aplicação ao trocar `MESSAGING_PROVIDER`; testes de contrato passam em ambos adapters.
**Status:** Não iniciado. Depende de M1.

## Milestones

| Marco | Critério | Dependência |
|---|---|---|
| M0 — Domínio fundacional pronto | DoD Fase 0 | Nenhuma |
| M1 — Fluxo assíncrono funcional | DoD Fase 1 (incl. exceções) | M0 |
| M2 — Broker intercambiável comprovado | DoD Fase 2 | M1 |

## Perguntas em aberto ainda não resolvidas (PRD seção 12)

- #1 Payment: recusa determinística vs probabilística — decidir no spec da Fase 1.
- #3 SLA de "pedido estagnado" — decidir no spec da Fase 1 (observabilidade).
- #4 Idempotency store compartilhada (Redis) vs isolada por subdomínio — decidir no spec da Fase 1.
- #5 Fase 1 e Fase 2 lado a lado ou substituição — decidir ao iniciar Fase 2.
- #6 Retenção de `processed_events` — decidir no spec da Fase 1.
