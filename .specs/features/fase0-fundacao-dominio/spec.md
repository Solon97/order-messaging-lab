# Fase 0 — Fundação de Domínio + API de Criação de Pedido — Specification

## Problem Statement

Hoje o repositório só tem o esqueleto padrão do NestJS (`AppModule`/`AppController`/`AppService`), sem nenhum domínio de negócio. Antes de introduzir mensageria (Fase 1) é preciso estabelecer a base do subdomínio `Order` — entidades, invariantes, caso de uso de criação, portas de persistência e o primeiro adapter (HTTP) — seguindo arquitetura hexagonal, de forma que as fases seguintes só acoplem infraestrutura sem jamais reescrever regra de negócio.

## Goals

- [ ] Domínio `Order` modelado com invariantes de negócio garantidas por teste (pedido sem itens é rejeitado; total calculado corretamente).
- [ ] `POST /orders` cria pedido de forma síncrona e retorna 201 com o recurso criado.
- [ ] `GET /orders/:id` retorna o pedido criado (ou 404 se não existir).
- [ ] Persistência trocável (in-memory para dev/teste, Postgres via TypeORM) sem alterar domínio/aplicação.
- [ ] Estrutura de módulo hexagonal (`domain/application/infrastructure`) estabelecida para o subdomínio `order`, replicável nas fases seguintes.
- [ ] Lint de arquitetura bloqueando imports de infraestrutura em `domain/`/`application/`, rodando em CI.
- [ ] Cobertura de teste unitário do domínio ≥ 80%.

## Out of Scope

| Feature | Reason |
|---|---|
| Mensageria (SNS/SQS/RabbitMQ), eventos `OrderCreated` publicados de fato | Fase 1 — nesta fase não há broker; outbox é modelado mas não drenado |
| Subdomínios `payment`, `stock`, `notification` | Decisão registrada em STATE.md — só entram com casos de uso reais na Fase 1 |
| Autenticação de usuário final (login/cadastro) | Não objetivo explícito do PRD (seção 2.2); só API Key/JWT de serviço, e mesmo assim fora do MVP de domínio |
| Cancelamento de pedido, `GET /orders` (listagem/paginação) | Backlog Futuro (PRD seção 11); Fase 0 cobre apenas criação e leitura por id |
| Idempotency-Key no `POST /orders` (dedupe de criação) | PRD marca como "recomendado", não Must; adiado para não acoplar IdempotencyStore antes da Fase 1, onde a store é definida |

---

## User Stories

### P1: Criar pedido via API síncrona ⭐ MVP

**User Story**: Como cliente (sistema consumidor da API), quero criar um pedido enviando itens e ser informado imediatamente do resultado, para poder prosseguir no fluxo de compra sem esperar processamento assíncrono.

**Why P1**: É o critério de saída explícito da Fase 0 no PRD (seção 3.1) e a base para todo o fluxo de eventos das fases seguintes.

**Acceptance Criteria**:

1. WHEN o cliente envia `POST /orders` com `customerId` válido e `items` não vazio (cada item com `sku` string, `quantity > 0`, `unitPrice >= 0`) THEN o sistema SHALL persistir o pedido com status `CREATED`, calcular `totalAmount` como soma de `quantity * unitPrice` de todos os itens, e retornar HTTP 201 com `{ orderId, status, totalAmount, createdAt }`.
2. WHEN o cliente envia `items` vazio THEN o sistema SHALL retornar HTTP 400 sem persistir nada.
3. WHEN o cliente envia um item com `quantity <= 0` ou `unitPrice < 0` THEN o sistema SHALL retornar HTTP 400 sem persistir nada.
4. WHEN o cliente envia `customerId` ausente ou em formato inválido (não-uuid) THEN o sistema SHALL retornar HTTP 400 sem persistir nada.
5. WHEN ocorre falha inesperada de persistência THEN o sistema SHALL retornar HTTP 500 sem expor detalhes internos no corpo da resposta.

**Independent Test**: Subir a aplicação com adapter in-memory, enviar `POST /orders` válido, receber 201 com `orderId`, e confirmar que o total bate com a soma calculada manualmente.

---

### P1: Consultar pedido criado ⭐ MVP

**User Story**: Como cliente, quero consultar um pedido pelo seu id, para confirmar que foi criado corretamente e ver seu status atual.

**Why P1**: Decisão registrada em STATE.md — necessário para validar a criação de forma independente do payload de resposta do POST, e é a base mínima de leitura que as fases seguintes vão precisar de qualquer forma.

**Acceptance Criteria**:

1. WHEN o cliente envia `GET /orders/:id` com um `id` de pedido existente THEN o sistema SHALL retornar HTTP 200 com `{ orderId, customerId, items, status, totalAmount, createdAt }`.
2. WHEN o cliente envia `GET /orders/:id` com um `id` inexistente THEN o sistema SHALL retornar HTTP 404.
3. WHEN o cliente envia `GET /orders/:id` com um `id` em formato inválido (não-uuid) THEN o sistema SHALL retornar HTTP 400.

**Independent Test**: Criar um pedido via `POST /orders`, em seguida fazer `GET /orders/:id` com o `orderId` retornado e confirmar que os dados batem.

---

### P1: Domínio `Order` com invariantes protegidas ⭐ MVP

**User Story**: Como time de arquitetura, quero que as regras de negócio do pedido vivam exclusivamente no domínio, para garantir que nenhuma camada de infraestrutura possa criar um pedido inválido.

**Why P1**: É o objetivo de aprendizado técnico central do lab (PRD seção 1.3) — validar que a arquitetura hexagonal isola o domínio.

**Modelagem de domínio (agregado `Order`):**

- `Order` — entidade raiz do agregado, identidade = `orderId`.
- `OrderItem` — **entidade filha** (não value object) dentro do agregado, com identidade própria (`orderItemId`), gerada na criação do pedido. Motivo: cada linha do pedido precisa ser rastreável e referenciável individualmente pelas fases seguintes (ex.: reserva parcial de estoque por item, backlog PRD §11) — duas linhas com os mesmos `sku`/`quantity`/`unitPrice` continuam sendo entradas distintas, não intercambiáveis por igualdade de valor.
- `Money`, `OrderStatus` — value objects (sem identidade, definidos inteiramente pelo valor; imutáveis).

**Acceptance Criteria**:

1. WHEN a entidade `Order` é construída sem itens THEN o domínio SHALL lançar um erro de domínio (não uma exceção HTTP) impedindo a criação.
2. WHEN a entidade `Order` é construída com todos os itens válidos THEN o domínio SHALL calcular `totalAmount` como `Money` (nunca `number` flutuante cru) somando `OrderItem.quantity * OrderItem.unitPrice`.
3. WHEN um `OrderItem` é construído com `quantity <= 0` ou `unitPrice < 0` THEN o domínio SHALL lançar um erro de domínio.
4. WHEN `Order` é criado com sucesso THEN seu `status` inicial SHALL ser `OrderStatus.CREATED`, e cada `OrderItem` da lista SHALL receber um `orderItemId` próprio (uuid), distinto entre si mesmo que os demais campos sejam idênticos.

**Independent Test**: Testes unitários (Jest) instanciando `Order`/`OrderItem`/`Money` diretamente, sem NestJS, sem HTTP, sem banco.

---

### P2: Persistência Postgres via TypeORM

**User Story**: Como time de arquitetura, quero uma implementação real de `OrderRepository` sobre Postgres, para aproximar o lab de um cenário realista de execução.

**Why P2**: PRD marca como "Should", não "Must" — o caminho crítico (Must) é o adapter in-memory. Postgres valida a portabilidade da porta, mas não bloqueia o critério de saída da fase.

**Acceptance Criteria**:

1. WHEN `PERSISTENCE_PROVIDER=POSTGRES` (ou equivalente) THEN a aplicação SHALL usar `TypeOrmOrderRepository` implementando `OrderRepository` sem alterar `application/` ou `domain/`.
2. WHEN um pedido é criado com o adapter Postgres ativo THEN os mesmos testes de aceite do `POST /orders`/`GET /orders/:id` (P1) SHALL passar sem alteração de asserção.

**Independent Test**: Rodar a suíte de testes de integração do `POST /orders` contra Postgres (via Testcontainers) e confirmar paridade de resultado com o adapter in-memory.

---

### P2: Lint de arquitetura bloqueante em CI

**User Story**: Como time de arquitetura, quero que um import proibido (ex.: SDK de banco ou de mensageria dentro de `domain/`) quebre o CI, para nunca depender de revisão manual para proteger a fronteira hexagonal.

**Why P2**: Decisão registrada em STATE.md (resolve a pergunta aberta #7 do PRD antecipando o mecanismo do risco descrito na seção 9.1) — não bloqueia o critério de saída funcional da Fase 0, mas é definido como obrigatório de configurar dentro dela.

**Acceptance Criteria**:

1. WHEN um arquivo em `src/order/domain/**` ou `src/order/application/**` importa algo de `src/order/infrastructure/**`, de `typeorm`, de qualquer SDK de mensageria, ou de módulos NestJS que dependam de infraestrutura (ex.: `@nestjs/typeorm`) THEN a checagem de lint de arquitetura SHALL falhar.
2. WHEN o CI roda em uma PR THEN a checagem de lint de arquitetura SHALL ser um step obrigatório (falha bloqueia merge).

**Independent Test**: Adicionar temporariamente um import proibido em `domain/`, rodar o comando de lint de arquitetura localmente e confirmar que ele falha com mensagem clara; remover o import e confirmar que passa.

---

### P3: Documentação OpenAPI do `POST /orders`

**User Story**: Como consumidor da API, quero uma especificação OpenAPI de `POST /orders` (e `GET /orders/:id`), para integrar sem precisar ler o código-fonte.

**Why P3**: PRD marca como "Should" para o endpoint de criação; é valor de documentação, não bloqueia nenhum critério funcional.

**Acceptance Criteria**:

1. WHEN a aplicação sobe em modo dev THEN um endpoint `/api-docs` (Swagger UI, via `@nestjs/swagger`) SHALL expor o contrato de `POST /orders` e `GET /orders/:id`, incluindo request/response/erros (400/404/500).

---

## Edge Cases

- WHEN `items` contém um item com `sku` vazio ou ausente THEN o sistema SHALL retornar HTTP 400.
- WHEN `totalAmount` calculado excede um limite de precisão monetária razoável (ex.: mais de 2 casas decimais em `unitPrice`) THEN o `Money` value object SHALL normalizar ou rejeitar (decisão de implementação: normalizar para 2 casas, arredondamento bancário) — a ser confirmado no Design se ambíguo.
- WHEN o corpo do `POST /orders` não é um JSON válido THEN o sistema SHALL retornar HTTP 400 (comportamento padrão do NestJS body parser, sem tratamento customizado adicional).
- WHEN o `id` do `GET /orders/:id` é um uuid válido mas de um pedido nunca criado THEN o sistema SHALL retornar 404, nunca 200 com corpo vazio.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| ORD0-01 | P1: Criar pedido via API síncrona | Tasks (T8, T13) | Mapped |
| ORD0-02 | P1: Criar pedido via API síncrona (validação 400) | Tasks (T10, T11, T13) | Mapped |
| ORD0-03 | P1: Consultar pedido criado | Tasks (T9, T13) | Mapped |
| ORD0-04 | P1: Domínio Order com invariantes protegidas | Tasks (T1-T6) | Mapped |
| ORD0-05 | P2: Persistência Postgres via TypeORM | Tasks (T17-T22) | Mapped |
| ORD0-06 | P2: Lint de arquitetura bloqueante em CI | Tasks (T15, T16) | Mapped |
| ORD0-07 | P3: Documentação OpenAPI | Tasks (T14) | Mapped |

**Coverage:** 7 total, 7 mapped to tasks, 0 unmapped ✅

---

## Success Criteria

- [ ] `POST /orders` com payload válido retorna 201 e persiste o pedido (adapter in-memory).
- [ ] `POST /orders` com itens vazios ou valores inválidos retorna 400.
- [ ] `GET /orders/:id` retorna 200 para pedido existente e 404 para inexistente.
- [ ] Testes unitários do domínio `Order` cobrem as invariantes com ≥ 80% de cobertura em `domain/`.
- [ ] Lint de arquitetura configurado e rodando como step obrigatório em CI, com 0 violações.
- [ ] Adapter Postgres implementado e passando pela mesma suíte de testes de aceite do adapter in-memory (Should — pode ficar como follow-up se necessário, mas está no escopo desta fase).
