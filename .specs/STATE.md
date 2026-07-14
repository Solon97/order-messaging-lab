# Project State

## Decisions

### AD-001: Either para erros de domínio conhecidos, em vez de throw

**Status:** Aceito
**Data:** 2026-07-14

**Contexto:** `OrderItem.create` e `Order.create` lançavam `InvalidOrderItemError` /
`EmptyOrderError` para validações de domínio esperadas (não excepcionais). Isso
força quem chama a lembrar de `try/catch`, sem qualquer garantia do compilador.

**Decisão:** As factories de domínio (`OrderItem.create`, `Order.create`)
passam a retornar `Either<DomainError, T>` (tipo próprio em
`src/shared/either.ts`, sem dependência externa) em vez de lançar exceção.
O caller é obrigado, pelo tipo, a tratar o caminho de erro.

**Escopo:** Restrito à camada de domínio (entities/aggregates). A camada de
aplicação (`CreateOrderUseCase`) desempacota o `Either` na borda e continua
lançando o `DomainError` como exceção, preservando o contrato externo atual
(NestJS exception filters, testes de use case). Erros verdadeiramente
excepcionais (bug de infra, etc.) continuam como exception — Either é só para
os casos de validação de domínio já conhecidos.

**Trade-off aceito:** mais um tipo para o time aprender (`Either`/`left`/
`right`) em troca de explicitness no tipo de retorno das factories.

### AD-002: Estende Either para a camada de aplicação (use cases)

**Status:** Aceito
**Data:** 2026-07-14

**Contexto:** Após AD-001, `CreateOrderUseCase` ainda desempacotava o
`Either` do domínio só para relançar (`throw result.value`) — reintroduzindo
exception para um erro já conhecido, só que um nível acima. `GetOrderUseCase`
já não lançava (retornava `Order | null`), mas isso deixava dois contratos
diferentes entre os use cases da mesma camada.

**Decisão:** Os use cases também passam a retornar `Either<DomainError, T>`
em vez de lançar/retornar `null` para casos esperados:
- `CreateOrderUseCase.execute` → `Either<EmptyOrderError | InvalidOrderItemError, Order>`.
- `GetOrderUseCase.execute` → `Either<OrderNotFoundError, Order>` (nova
  classe de erro em `src/order/domain/errors/order-not-found.error.ts`,
  já que "pedido não encontrado" é um caso esperado, não excepcional).

**Escopo:** Não há controllers/consumidores externos hoje (confirmado por
busca no repo) — o ajuste fica contido em `src/order/application/` e seus
testes. Quando um controller HTTP for introduzido, ele é quem decide o
mapeamento Either → status HTTP (ex.: `left` de `OrderNotFoundError` → 404),
mantendo a lógica de apresentação fora do domínio/aplicação.

## Handoff

_(nenhum trabalho em andamento no momento)_
