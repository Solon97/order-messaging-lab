# Fase 1 — Mensageria (messaging-flow) Context

**Gathered:** 2026-07-14
**Spec:** `.specs/features/messaging-flow/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Implementar a coreografia assíncrona completa do pedido via SNS/SQS: `Order` publica `OrderCreated`; os novos subdomínios `Stock`, `Payment` e `Notification` (criados nesta fase, seguindo a mesma estrutura hexagonal — `domain/application/infrastructure` — e o mesmo padrão de persistência de `order`) reagem em cadeia até `COMPLETED` ou um estado terminal de exceção (`STOCK_UNAVAILABLE`, `PAYMENT_DECLINED`). Inclui idempotência, retry/backoff, DLQ, outbox transacional e observabilidade mínima. RabbitMQ (Fase 2) está fora do escopo desta fase.

---

## Implementation Decisions

### Payment — simulação de recusa

- Determinística por valor: `totalAmount` acima de um limite configurável (env var) sempre recusa. Reproduzível em testes, sem necessidade de seed/mock de aleatoriedade.

### Idempotency store

- Compartilhada: um store central (Redis) usado por todos os consumidores (`stock-reserve`, `payment`, `stock-deduct`, `notification`, `order` — quando Order também consumir eventos de status final). Chave lógica `consumer + idempotencyKey`.
- Consequência arquitetural: introduz uma nova peça de infraestrutura (Redis) além do Postgres já existente — precisa entrar no tech stack da Fase 1 e no `docker-compose` de dev/teste.

### Retenção de processed_events

- TTL/retenção implementada já na Fase 1 (não fica em aberto) — expiração de chaves no Redis via TTL nativo, não uma tabela Postgres a ser limpa manualmente. Valor de TTL default a ser fechado no Design (candidato inicial: alinhado à janela máxima de redrive/retry, com folga).

### Consumo de filas SQS

- Polling manual na camada de `infrastructure` de cada subdomínio, chamando o use case correspondente. Sem `@nestjs/microservices` custom transport — preserva controle direto sobre retry/DLQ/visibility timeout e portabilidade para RabbitMQ na Fase 2.

### SLA de "pedido estagnado"

- 5 minutos sem progresso de evento é o limiar de observabilidade/alerta (métrica/log, não cancelamento automático — cancelamento ativo continua no Backlog Futuro).

### Outbox poller

- Roda como job agendado dentro do próprio processo NestJS (`@nestjs/schedule`, interval), não como processo separado — consistente com a topologia de monólito modular já decidida em STATE.md. Usuário não tinha modelo mental prévio do padrão outbox; decisão tomada por recomendação técnica após explicação, sem objeção.

### Persistência dos novos subdomínios

- Mesmo padrão da Fase 0: cada subdomínio (`stock`, `payment`, `notification`) ganha adapter in-memory (dev/teste padrão) + adapter Postgres (schema próprio), seguindo `PERSISTENCE_PROVIDER`.

### Seed de estoque

- Seed fixo simples: todo SKU nasce com saldo alto padrão (ex.: 1000 unidades) na inicialização do adapter — sem endpoint administrativo de gestão de estoque nesta fase. `StockUnavailable` é testado forçando quantidade pedida acima do saldo seed, não via endpoint de ajuste.

### Status agregado do pedido (Order)

- `Order` passa a consumir os eventos terminais do fluxo (`StockDeducted` no caminho feliz → `COMPLETED`; `StockUnavailable` → `STOCK_UNAVAILABLE`; `PaymentDeclined` → `PAYMENT_DECLINED`) e atualiza seu próprio registro. `GET /orders/:id` passa a refletir o progresso real do pedido — dá valor observável ao endpoint que já existia congelado em `CREATED` desde a Fase 0.

### Notificação

- `NotifyCustomer` usa uma porta `NotificationSender` (nova) com um adapter mock que simula o envio (payload/latência formatados como um e-mail real seria), além de emitir o log estruturado. Mais próximo de um cenário real do que apenas log.

### correlationId

- Reutiliza o próprio `orderId` como `correlationId` em todos os eventos do fluxo (que já coincide com o `idempotencyKey`, por design do PRD §4.3). Sem UUID adicional a gerar/propagar.

### Agent's Discretion

- Nome exato das filas/tópicos locais (mapa lógico→físico) e formato do log estruturado (campos extras além dos exigidos pelo PRD §4.7): decisão técnica de Design.
- Escolha entre LocalStack via docker-compose vs. Testcontainers para os testes de integração desta fase: Design decide, seguindo o precedente de Testcontainers já usado no Postgres da Fase 0 (AD relevante em STATE.md) quando aplicável a SNS/SQS.
- Valor exato do TTL de idempotência no Redis e do `maxReceiveCount` de cada fila antes de mover para DLQ: Design decide com base nos NFRs do PRD §6 (retry com backoff, ≥99% sucesso após retries).

### Declined / Undiscussed Gray Areas → Assumptions

- **Auth boundaries & rate limits:** N/A nesta fase — comunicação entre subdomínios via broker não exige autenticação ponto-a-ponto adicional (PRD §5.4); a fronteira de confiança é o próprio broker gerenciado. Nenhuma pergunta feita ao usuário sobre isso; segue literalmente o que o PRD já define.
- **Concurrency/ordering:** assumido "at-least-once, sem garantia de ordenação estrita" conforme PRD §9.1/§9.3 — não discutido explicitamente com o usuário porque o PRD já resolve essa questão como suposição explícita, não como gray area em aberto.

---

## Specific References

Nenhuma referência externa específica trazida pelo usuário — decisões seguiram as opções recomendadas apresentadas, com uma exceção (idempotency store: usuário escolheu Redis compartilhado em vez da opção recomendada de tabela isolada por subdomínio).

---

## Deferred Ideas

- Endpoint administrativo de gestão de estoque (seed/ajuste manual) — fora do escopo desta fase, não priorizado pelo usuário.
- Tracing distribuído completo via OpenTelemetry — já registrado como sugestão/backlog no PRD §11, não trazido à tona nesta discussão.
