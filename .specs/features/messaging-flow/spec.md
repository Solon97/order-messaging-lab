# Fase 1 — Mensageria com SNS/SQS (messaging-flow) Specification

## Problem Statement

Hoje (Fase 0) um pedido criado via `POST /orders` fica congelado em `CREATED` — não há reserva de estoque, cobrança ou notificação. O lab precisa provar, na prática, que um fluxo de processamento de pedido pode ser coreografado de forma assíncrona e resiliente entre subdomínios independentes (`Stock`, `Payment`, `Notification`), sem orquestrador central, sem contaminar o domínio com detalhes de SNS/SQS, e sem perder ou duplicar efeitos colaterais em face de reentregas/falhas do broker.

## Goals

- [ ] Um pedido criado percorre reserva → pagamento → baixa de estoque → notificação de forma inteiramente assíncrona, sem chamada síncrona entre subdomínios — métrica: 0 imports diretos entre módulos de subdomínio fora de `domain`/`application` compartilhados.
- [ ] `GET /orders/:id` reflete o estado real do pedido (`CREATED` → `COMPLETED` ou um estado terminal de exceção) conforme o fluxo avança — métrica: status final visível via API corresponde ao último evento terminal consumido.
- [ ] Reentrega de evento (duplicidade) e falha permanente de consumidor não geram efeito colateral duplicado nem mensagem perdida — métrica: 0 efeitos colaterais duplicados em 100 reenvios simulados; 100% das mensagens não processadas com sucesso terminam em DLQ.
- [ ] Nenhum SDK de SNS/SQS é importado em `domain/` ou `application/` de nenhum subdomínio — métrica: `npm run lint:arch` com 0 violações (regra já ativa desde a Fase 0).

## Out of Scope

Explicitamente excluído desta fase. Documentado para prevenir scope creep.

| Feature | Reason |
| --- | --- |
| Adapter RabbitMQ / `MESSAGING_PROVIDER` intercambiável | Fase 2 do roadmap — as portas `MessagePublisher`/`MessageConsumer` desta fase devem ficar prontas para isso, mas o adapter concreto não é construído agora |
| Compensação automática (liberação de reserva em `PaymentDeclined`, cancelamento em `StockUnavailable`) | Não objetivo explícito do PRD §2.2 — estados terminais são apenas observáveis nesta fase |
| Cancelamento de pedido (`OrderCancelled`) iniciado pelo cliente | Backlog Futuro (PRD §11) |
| Timeout ativo com cancelamento automático de pedido "estagnado" | Backlog Futuro — esta fase cobre apenas alerta/observabilidade do SLA, não ação automática |
| Reprocessamento manual de DLQ via UI/ferramenta administrativa | Backlog Futuro |
| Endpoint administrativo de gestão de saldo de estoque | Deferido nesta discussão — seed fixo cobre o necessário para testar `StockUnavailable` |
| Integração real com gateway de pagamento | PRD §9.3 — Payment é sempre mock/simulado, em todas as fases |
| Tracing distribuído via OpenTelemetry | Sugestão do PRD §11, não compromisso — logs correlacionados por `correlationId`/`traceId` bastam nesta fase |
| Testes de contrato duplicados contra RabbitMQ | Fase 2 |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Recusa de pagamento (PRD pergunta #1) | Determinística: `totalAmount` acima de limite configurável sempre recusa | Reproduzível em teste, cobre AC de `ProcessPayment` recusado sem flakiness | y |
| Idempotency store (PRD pergunta #4) | Redis compartilhado entre todos os consumidores, chave `consumer + idempotencyKey` | Escolha explícita do usuário (contra a recomendação de tabela isolada por subdomínio) | y |
| Retenção de `processed_events` (PRD pergunta #6) | TTL nativo no Redis, já nesta fase (valor exato fechado no Design) | Redis torna TTL nativo mais simples que job de purge em tabela Postgres | y |
| Consumo de filas SQS | Polling manual na camada de infraestrutura de cada subdomínio | Controle direto sobre retry/DLQ/visibility timeout; preserva portabilidade para RabbitMQ na Fase 2 | y |
| SLA de "pedido estagnado" (PRD pergunta #3) | 5 minutos sem progresso de evento → alerta/métrica (sem cancelamento automático) | Folga generosa acima do NFR de p99 ≤ 10s do caminho feliz | y |
| Local do outbox poller | Job agendado (`@nestjs/schedule`) dentro do próprio processo NestJS | Consistente com topologia de monólito modular já decidida; sem infra extra | y |
| Persistência de Stock/Payment/Notification | Mesmo padrão da Fase 0: adapter in-memory + adapter Postgres (schema próprio por subdomínio) | Consistência arquitetural, reuso do padrão validado na Fase 0 | y |
| Seed de saldo de estoque | Saldo fixo alto por SKU na inicialização do adapter, sem endpoint de gestão | Suficiente para testar caminho feliz e `StockUnavailable` sem escopo extra | y |
| Order consome eventos terminais e atualiza status | Sim — `Order` também vira consumidor (`StockDeducted`/`StockUnavailable`/`PaymentDeclined`) | Dá valor observável real ao `GET /orders/:id` já existente | y |
| Efeito de `NotifyCustomer` | Porta `NotificationSender` com adapter mock (simula envio) + log estruturado | Mais próximo de cenário real que apenas log, sem integrar serviço externo de fato | y |
| `correlationId` | Reutiliza `orderId` (idêntico ao `idempotencyKey`) | Evita gerar/propagar um identificador adicional sem benefício nesta fase | y |
| Auth entre subdomínios via evento | N/A — sem autenticação ponto-a-ponto adicional; fronteira de confiança é o broker gerenciado | Já definido pelo PRD §5.4, não é gray area em aberto | y (assumption, não discutida) |
| Ordenação de mensagens | At-least-once, sem garantia de ordenação estrita entre brokers | Suposição explícita do PRD §9.1/§9.3 | y (assumption, não discutida) |

**Open questions:** none — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Fluxo assíncrono do caminho feliz ⭐ MVP

**User Story**: Como cliente que criou um pedido, quero que ele seja processado automaticamente (reserva de estoque, pagamento, baixa, notificação) sem eu precisar chamar nenhuma API adicional, para que eu só precise consultar `GET /orders/:id` e ver o resultado final.

**Why P1**: É o núcleo do critério de saída da Fase 1 — sem isso, não existe fluxo assíncrono nenhum para testar idempotência/DLQ em cima.

**Acceptance Criteria**:

1. WHEN `POST /orders` retorna 201 THEN o subdomínio Order SHALL persistir um `outbox_events` na mesma transação local e publicar `OrderCreated` v1 (via outbox poller) no tópico `order.created`.
2. WHEN `Stock` consome `OrderCreated` e há saldo suficiente para todos os itens THEN `Stock` SHALL reservar os itens (decremento lógico do saldo disponível) e publicar `StockReserved` v1 no tópico `stock.reserved`, propagando `correlationId`/`traceId` recebidos.
3. WHEN `Payment` consome `StockReserved` e a regra determinística de recusa não é atingida THEN `Payment` SHALL aprovar a cobrança e publicar `PaymentApproved` v1 no tópico `payment.approved`.
4. WHEN `Stock` consome `PaymentApproved` THEN `Stock` SHALL transitar a reserva de `RESERVED` para `DEDUCTED` (baixa definitiva do saldo físico) e publicar `StockDeducted` v1 no tópico `stock.deducted`.
5. WHEN `Notification` consome `StockDeducted` THEN `Notification` SHALL registrar uma notificação simulada (via `NotificationSender` mock + log estruturado) contendo `orderId`/`customerId`/`correlationId`.
6. WHEN `Order` consome `StockDeducted` THEN `Order` SHALL atualizar seu registro para status `COMPLETED`.
7. WHEN `GET /orders/:id` é chamado após o fluxo completo THEN a resposta SHALL refletir `status=COMPLETED`.
8. WHEN qualquer evento do fluxo é publicado THEN seu envelope SHALL conter `correlationId` idêntico ao `orderId` do pedido original, propagado sem regeneração em nenhuma etapa.

**Independent Test**: Criar um pedido com SKU de saldo suficiente e valor abaixo do limite de recusa; aguardar o fluxo assíncrono (via LocalStack/Testcontainers em teste de integração); consultar `GET /orders/:id` e confirmar `status=COMPLETED`; inspecionar os 4 eventos publicados e confirmar `correlationId` idêntico em todos.

---

### P1: Estados terminais de exceção (StockUnavailable / PaymentDeclined)

**User Story**: Como operador do lab, quero que pedidos sem estoque suficiente ou com pagamento recusado parem de avançar no fluxo em um estado terminal observável, para que eu possa distinguir "em progresso" de "falhou por regra de negócio" sem confundir com bug.

**Why P1**: São Must explícitos do PRD (§3.2, §8.1) e parte do critério de saída da fase — sem eles, o fluxo só testa o caminho feliz.

**Acceptance Criteria**:

1. WHEN `Stock` consome `OrderCreated` e o saldo disponível de algum item é insuficiente THEN `Stock` SHALL publicar `StockUnavailable` v1 (contrato mínimo, terminal) e SHALL NOT publicar `StockReserved`.
2. WHEN `Order` consome `StockUnavailable` THEN `Order` SHALL atualizar seu registro para status `STOCK_UNAVAILABLE`.
3. WHEN `Payment` consome `StockReserved` e `totalAmount` excede o limite configurável de recusa THEN `Payment` SHALL publicar `PaymentDeclined` v1 (contrato mínimo, terminal) e SHALL NOT publicar `PaymentApproved`.
4. WHEN `Order` consome `PaymentDeclined` THEN `Order` SHALL atualizar seu registro para status `PAYMENT_DECLINED`.
5. WHEN um pedido atinge `STOCK_UNAVAILABLE` ou `PAYMENT_DECLINED` THEN nenhum evento subsequente do caminho feliz (`PaymentApproved`, `StockDeducted`) SHALL ser publicado para esse `orderId`.

**Independent Test**: Criar um pedido pedindo quantidade acima do saldo seed de um SKU → confirmar `GET /orders/:id` retorna `STOCK_UNAVAILABLE` e nenhum evento de `Payment`/`Notification` foi publicado. Repetir com `totalAmount` acima do limite de recusa (saldo suficiente) → confirmar `PAYMENT_DECLINED` e nenhuma baixa de estoque/notificação ocorreu.

---

### P2: Idempotência em reentrega de evento

**User Story**: Como operador do lab, quero que a reentrega de um evento já processado (comum em SQS "at-least-once") não gere efeito colateral duplicado, para que o sistema seja seguro sob a garantia de entrega real do broker.

**Why P2**: Depende do P1 existir (fluxo a processar) para ter algo a duplicar; é Must do PRD mas logicamente construído em cima do caminho feliz.

**Acceptance Criteria**:

1. WHEN um consumidor recebe um evento cujo par `(consumer, idempotencyKey)` já existe no store de idempotência (Redis) THEN o consumidor SHALL confirmar (ack) a mensagem sem reexecutar o efeito colateral, e SHALL registrar um log de "evento duplicado ignorado".
2. WHEN um consumidor processa um evento pela primeira vez com sucesso THEN o consumidor SHALL marcar `(consumer, idempotencyKey)` como processado no Redis com TTL definido antes de confirmar (ack) a mensagem.
3. WHEN `OrderCreated` do mesmo `orderId` é reentregue 100 vezes para `Stock` THEN `Stock` SHALL ter exatamente 1 reserva efetivada (0 reservas duplicadas).

**Independent Test**: Publicar manualmente o mesmo evento `OrderCreated` (mesmo `idempotencyKey`) duas vezes na fila `stock.reserve.queue`; confirmar que apenas uma reserva foi criada e que o segundo processamento gerou o log de duplicidade sem erro.

---

### P2: Retry com backoff e Dead Letter Queue

**User Story**: Como operador do lab, quero que falhas transitórias sejam reprocessadas automaticamente e falhas permanentes acabem numa DLQ investigável, para que nenhuma mensagem seja perdida silenciosamente nem fique reprocessando para sempre.

**Why P2**: Constrói sobre o consumo de eventos do P1; é a garantia de confiabilidade exigida pelo NFR do PRD §6.

**Acceptance Criteria**:

1. WHEN um consumidor lança uma exceção classificada como transitória ao processar um evento THEN a mensagem SHALL NOT ser confirmada (ack), permitindo redelivery via visibility timeout/redrive policy do SQS.
2. WHEN uma falha transitória simulada ocorre nas primeiras tentativas e depois se resolve THEN o consumidor SHALL eventualmente processar o evento com sucesso dentro do número de tentativas configurado, sem intervenção manual.
3. WHEN uma mensagem atinge o número máximo de tentativas configurado (`maxReceiveCount`) sem sucesso THEN o SQS SHALL mover a mensagem para a DLQ correspondente àquela fila.
4. WHEN uma mensagem está na DLQ THEN um log/alerta de criticidade alta SHALL ser emitido, identificável por `orderId`/`correlationId`.

**Independent Test**: Configurar um consumidor de teste para falhar nas primeiras N tentativas de um evento e suceder na N+1; confirmar reprocessamento automático até sucesso. Configurar outro cenário para falhar sempre; confirmar que a mensagem aparece na fila DLQ após esgotar `maxReceiveCount`.

---

### P3: Observabilidade mínima e alerta de pedido estagnado

**User Story**: Como operador do lab, quero logs estruturados correlacionáveis e um sinal de "pedido parado" além do SLA esperado, para que eu consiga depurar um fluxo distribuído sem acessar cada subdomínio manualmente.

**Why P3**: Should no PRD (não bloqueia o critério de saída "at-least-once + idempotência + DLQ"), mas necessário para o DoD completo da Fase 1.

**Acceptance Criteria**:

1. WHEN qualquer subdomínio processa um evento (sucesso, duplicidade ignorada, falha, ou publicação) THEN ele SHALL emitir um log estruturado (JSON) contendo no mínimo `correlationId`, `traceId`, `eventType`, `idempotencyKey` e `orderId`.
2. WHEN um pedido fica 5 minutos sem que nenhum evento novo seja registrado para seu `correlationId` (e ainda não está em estado terminal) THEN o sistema SHALL emitir um log/métrica de "pedido estagnado" identificando o `orderId` e a última etapa conhecida.
3. WHEN um endpoint de métricas é consultado THEN ele SHALL expor latência (p50/p95/p99) e taxa de erro por consumidor, em formato compatível com Prometheus.

**Independent Test**: Simular um pedido cujo fluxo trava propositalmente após `StockReserved` (ex.: consumidor de Payment desligado em teste); aguardar 5 min (ou usar clock injetável no teste) e confirmar o log/métrica de estagnação aponta a última etapa correta (`StockReserved`).

---

## Edge Cases

- WHEN um pedido tem múltiplos itens e apenas um deles tem saldo insuficiente THEN `Stock` SHALL recusar a reserva inteira (sem reserva parcial) e publicar `StockUnavailable` — reserva parcial por item é Backlog Futuro (PRD §11).
- WHEN o outbox poller falha ao publicar um evento `PENDING` (broker indisponível) THEN o evento SHALL permanecer `PENDING` e ser retentado na próxima execução do poller, sem duplicar a linha na tabela `outbox_events`.
- WHEN dois eventos terminais concorrentes tentam atualizar o mesmo `orderId` no subdomínio Order (cenário teórico, não esperado no caminho normal) THEN a última escrita bem-sucedida prevalece — não há reconciliação especial nesta fase (fora de escopo: lock distribuído).
- WHEN o Redis do idempotency store está indisponível no momento do processamento THEN o consumidor SHALL tratar isso como falha transitória (não confirma a mensagem), reentrando no fluxo de retry — nunca processa sem checar idempotência.
- WHEN um evento chega com schema inválido (campo obrigatório ausente) THEN o consumidor SHALL rejeitar sem retry (erro não-transitório) e mover diretamente para tratamento de erro permanente/DLQ, já que reprocessar o mesmo payload inválido nunca teria sucesso.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| MSG1-01 | P1: Fluxo assíncrono do caminho feliz | Design | Pending |
| MSG1-02 | P1: Estados terminais de exceção | Design | Pending |
| MSG1-03 | P2: Idempotência em reentrega de evento | Design | Pending |
| MSG1-04 | P2: Retry com backoff e DLQ | Design | Pending |
| MSG1-05 | P3: Observabilidade mínima e alerta de pedido estagnado | Design | Pending |

**ID format:** `MSG1-NN` (Fase 1 — messaging-flow)

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 5 total, 0 mapped to tasks, 5 unmapped ⚠️ (Design/Tasks ainda não iniciados)

---

## Success Criteria

- [ ] Um pedido criado no caminho feliz atinge `status=COMPLETED` via `GET /orders/:id` sem nenhuma chamada síncrona adicional do cliente.
- [ ] 0 efeitos colaterais duplicados em 100 reenvios simulados do mesmo evento.
- [ ] 100% das mensagens não processadas com sucesso terminam em DLQ (nenhuma perda silenciosa).
- [ ] `npm run lint:arch` continua em 0 violações com os 3 novos subdomínios adicionados.
- [ ] `correlationId` idêntico em 100% dos eventos de um mesmo pedido, do início ao fim, verificável por busca em log.
