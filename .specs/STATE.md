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

## Handoff

_(nenhum trabalho em andamento no momento)_
