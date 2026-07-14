# Fase 0 — Fundação de Domínio + API de Criação de Pedido — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/fase0-fundacao-dominio/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase (no existing domain/application tests to sample — `src/app.*.spec.ts` is the only precedent, a trivial NestJS default). Guidelines found: `.specs/features/fase0-fundacao-dominio/spec.md` (Success Criteria: "≥ 80% cobertura em `domain/`"), no `AGENTS.md`/`CONTRIBUTING.md`/coverage threshold in `package.json`. Strong defaults applied elsewhere.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
|---|---|---|---|---|
| Domain (`Order`, `OrderItem`, `Money`, `OrderStatus`, domain errors) | unit | All branches; 1:1 to spec ACs (ORD0-04) + every listed edge case (sku vazio, quantity/unitPrice inválidos, precisão monetária); ≥ 80% coverage enforced via `jest coverageThreshold` scoped to `src/order/domain/` | `src/order/domain/**/*.spec.ts` | `npm test -- order/domain` |
| Application (`CreateOrderUseCase`, `GetOrderUseCase`) | unit | All branches; success + domain-error propagation paths | `src/order/application/**/*.spec.ts` | `npm test -- order/application` |
| Persistence adapters (`InMemoryOrderRepository`, `TypeOrmOrderRepository`, mapper) | unit (in-memory, mapper) / integration (TypeORM against real Postgres) | Key query paths (save, findById hit/miss) + round-trip field-by-field parity | `src/order/infrastructure/persistence/**/*.spec.ts` | `npm test -- order/infrastructure/persistence` (unit) / `npm run test:e2e -- postgres` (integration, Testcontainers) |
| HTTP controller + DTOs + exception filter | e2e | Every route in scope (`POST /orders`, `GET /orders/:id`): happy path + every listed edge case (ORD0-01 AC1-5, ORD0-03 AC1-3, edge cases do spec) | `test/**/*.e2e-spec.ts` | `npm run test:e2e` |
| Architecture lint config (`.dependency-cruiser.js`) | none (manual verification per spec's Independent Test) | — build/CI gate only | — | `npm run lint:arch` |
| CI workflow | none | — | — | N/A (verified by CI run) |
| Swagger bootstrap / `@ApiProperty` decorators | none | — build gate only | — | `npm run build` |

## Gate Check Commands

> Generated from `package.json` scripts — confirm before Execute. `lint:arch` and `test:e2e` (Testcontainers variant) are created by this feature's own tasks (T15, T22) — until then, use only the commands already present.

| Gate Level | When to Use | Command |
|---|---|---|
| Quick | After tasks with unit tests only (domain, application, in-memory/mapper) | `npm test` |
| Full | After tasks with e2e/integration tests (controller, Postgres adapter) | `npm test && npm run test:e2e` |
| Build | After phase completion or config/entity-only tasks | `npm run build && npm run lint && npm run test:cov` (+ `npm run lint:arch` once T15 lands) |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Domain Foundation ✅ Complete

```
T1 → T2 → T3 → T4 → T5 → T6
```

### Phase 2: Application Layer + In-Memory Adapter ✅ Complete

```
T7 → T8 → T9
```

### Phase 3: HTTP Adapter (P1 critical path) ✅ Complete

```
T10 → T11 → T12 → T13 -> T14
```

### Phase 4: Architecture Lint + CI (P2)

```
T15 → T16
```

### Phase 5: Postgres Adapter (P2)

```
T17 → T18 → T19 → T20 → T21 → T22
```

---

## Task Breakdown

### T1: Create `Money` value object ✅ Done

**What**: Implement `Money` VO with internal cents-integer representation, `fromNumber`, `add`, `multiply`, `amount` getter, `equals`; banker's rounding on normalization to 2 decimals (per spec edge case + AD-004).
**Where**: `src/order/domain/value-objects/money.vo.ts` (moved from `src/order/domain/money.vo.ts` in a later reorg)
**Depends on**: None
**Reuses**: nothing (new subdomain)
**Requirement**: ORD0-04 (AC2), edge case (precisão monetária)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `Money.fromNumber`, `add`, `multiply`, `amount`, `equals` implemented per design interface
- [x] Internal representation is integer cents, never raw float arithmetic
- [x] Normalization uses banker's rounding (half-to-even) to 2 decimals
- [x] Gate check passes: `npm test -- money.vo`
- [x] Test count: ≥ 6 tests pass (fromNumber normalization incl. `0.1+0.2`-style cases, add, multiply, equals, rounding edge cases) — 9 tests

**Tests**: unit
**Gate**: quick

---

### T2: Create `OrderStatus` value object ✅ Done

**What**: Implement `OrderStatus` enum with `CREATED` member (Fase 1 states reserved as comment, not implemented).
**Where**: `src/order/domain/value-objects/order-status.vo.ts` (moved from `src/order/domain/order-status.vo.ts` in a later reorg)
**Depends on**: None
**Reuses**: nothing
**Requirement**: ORD0-04 (AC4)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `OrderStatus.CREATED` exported and usable as a TS type
- [x] Gate check passes: `npm run build`

**Tests**: none (trivial enum, matrix: Entity/config → none)
**Gate**: build

---

### T3: Create domain error hierarchy ✅ Done

**What**: Implement `DomainError` base class and `EmptyOrderError`, `InvalidOrderItemError` subclasses (plain `Error` subclasses, distinguishable via `instanceof`/`name`).
**Where**: `src/shared/errors/domain-error.ts` (moved out of `order/domain/errors/` in a later reorg — shared across subdomains), `src/order/domain/errors/empty-order.error.ts`, `src/order/domain/errors/invalid-order-item.error.ts`
**Depends on**: None
**Reuses**: nothing
**Requirement**: ORD0-04 (AC1, AC3)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `DomainError extends Error`; both subclasses extend `DomainError`
- [x] `instanceof DomainError` is true for both subclasses
- [x] Gate check passes: `npm run build`

**Tests**: none (matrix: trivial error classes, no branching logic → build gate only)
**Gate**: build

---

### T4: Create `OrderItem` entity ✅ Done

**What**: Implement `OrderItem.create` factory validating `sku` non-empty, `quantity > 0`, `unitPrice >= 0`; assigns `orderItemId` via `crypto.randomUUID()` (AD-005); throws `InvalidOrderItemError` on violation.
**Where**: `src/order/domain/entities/order-item.entity.ts`, `src/order/domain/entities/order-item.entity.spec.ts` (moved from `src/order/domain/` in a later reorg)
**Depends on**: T1 (Money), T3 (InvalidOrderItemError)
**Reuses**: `Money`, `InvalidOrderItemError`
**Requirement**: ORD0-04 (AC3, AC4)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `OrderItem.create` implemented per design interface (`sku`, `quantity`, `unitPrice` getters + `orderItemId`)
- [x] Throws `InvalidOrderItemError` for empty/missing `sku`, `quantity <= 0`, `unitPrice < 0`
- [x] Two items with identical `sku`/`quantity`/`unitPrice` get distinct `orderItemId`s
- [x] Gate check passes: `npm test -- order-item.entity`
- [x] Test count: ≥ 6 tests pass (valid creation, empty sku, missing sku, quantity <= 0, unitPrice < 0, distinct ids) — 6 tests

**Tests**: unit
**Gate**: quick

---

### T5: Create `Order` aggregate root ✅ Done

**What**: Implement `Order.create` factory: rejects empty `items` (`EmptyOrderError`), builds `OrderItem`s, computes `totalAmount` as `Money` sum of `quantity * unitPrice` per item, sets `status = OrderStatus.CREATED`, assigns `orderId` via `crypto.randomUUID()`.
**Where**: `src/order/domain/entities/order.aggregate.ts`, `src/order/domain/entities/order.aggregate.spec.ts` (moved from `src/order/domain/` in a later reorg)
**Depends on**: T1 (Money), T2 (OrderStatus), T3 (EmptyOrderError), T4 (OrderItem)
**Reuses**: `Money`, `OrderStatus`, `EmptyOrderError`, `OrderItem`
**Requirement**: ORD0-04 (AC1, AC2, AC4)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `Order.create` implemented per design interface (`orderId`, `customerId`, `items`, `status`, `totalAmount`, `createdAt` getters)
- [x] Throws `EmptyOrderError` when `items` is empty
- [x] `totalAmount` is a `Money` instance summing `quantity * unitPrice` across all items correctly
- [x] `status` is `OrderStatus.CREATED` on successful creation
- [x] Item-level invalid data propagates as `InvalidOrderItemError` (no swallowing)
- [x] Gate check passes: `npm test -- order.aggregate`
- [x] Test count: ≥ 6 tests pass (empty items rejected, correct total for multiple items, status is CREATED, invalid item propagates, distinct orderIds across two orders) — 6 tests

**Tests**: unit
**Gate**: quick

---

### T6: Create `OrderRepository` port + domain coverage threshold ✅ Done

**What**: Define the `OrderRepository` interface (`save`, `findById`) in the domain layer; configure Jest `coverageThreshold` scoped to `src/order/domain/` at 80% (statements/branches/functions/lines) in `package.json`, per spec Success Criteria.
**Where**: `src/order/domain/repositories/order-repository.ts` (moved from `src/order/domain/order-repository.port.ts` in a later reorg), `package.json` (jest config)
**Depends on**: T5 (Order)
**Reuses**: `Order`
**Requirement**: ORD0-04, ORD0-05 (port definition), spec Success Criteria (80% domain coverage)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `OrderRepository` interface exported with `save(order: Order): Promise<void>` and `findById(orderId: string): Promise<Order | null>`
- [x] `jest.coverageThreshold` added scoped to `src/order/domain/**/*.ts` at 80%
- [x] Gate check passes: `npm run test:cov` reports ≥ 80% for `src/order/domain/`
- [x] Gate check passes: `npm run build`

**Tests**: none (interface + config; matrix: Entity/config → none, verified via build + coverage gate)
**Gate**: build

---

### T7: Create `InMemoryOrderRepository` adapter ✅ Done

**What**: Implement `OrderRepository` backed by a `Map<string, Order>`.
**Where**: `src/order/infrastructure/persistence/in-memory-order.repository.ts`, `src/order/infrastructure/persistence/in-memory-order.repository.spec.ts`
**Depends on**: T6 (OrderRepository port)
**Reuses**: `OrderRepository`, `Order`
**Requirement**: ORD0-01, ORD0-03 (default persistence adapter)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `save` stores the order, `findById` returns it; `findById` returns `null` for unknown id
- [x] Two `save` calls with different orders are both independently retrievable
- [x] Gate check passes: `npm test -- in-memory-order.repository`
- [x] Test count: ≥ 3 tests pass (save+findById hit, findById miss, multiple orders isolated) — 3 tests

**Tests**: unit
**Gate**: quick

---

### T8: Create `CreateOrderUseCase` ✅ Done

**What**: Implement `execute(input)` orchestrating `Order.create` + `OrderRepository.save`, injected via `ORDER_REPOSITORY` token.
**Where**: `src/order/application/create-order.use-case.ts`, `src/order/application/create-order.use-case.spec.ts`, `src/order/application/order-repository.token.ts` (DI token)
**Depends on**: T7 (InMemoryOrderRepository, used as the concrete repo in tests), T5 (Order)
**Reuses**: `Order.create`, `OrderRepository`, `InMemoryOrderRepository`
**Requirement**: ORD0-01 (AC1)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `execute` builds an `Order` via `Order.create` and persists it via the injected repository
- [x] Returns the created `Order` (with `orderId`, `totalAmount`, `status`, `createdAt`)
- [x] Domain errors (`EmptyOrderError`, `InvalidOrderItemError`) propagate uncaught (not swallowed/wrapped)
- [x] Gate check passes: `npm test -- create-order.use-case`
- [x] Test count: ≥ 4 tests pass (success persists + returns correct total, empty items propagates EmptyOrderError, invalid item propagates InvalidOrderItemError, repository.save is called exactly once on success) — 4 tests

**Tests**: unit
**Gate**: quick

---

### T9: Create `GetOrderUseCase` ✅ Done

**What**: Implement `execute(orderId)` delegating to `OrderRepository.findById`.
**Where**: `src/order/application/get-order.use-case.ts`, `src/order/application/get-order.use-case.spec.ts`
**Depends on**: T7 (InMemoryOrderRepository, used as the concrete repo in tests)
**Reuses**: `OrderRepository`, `InMemoryOrderRepository`
**Requirement**: ORD0-03 (AC1, AC2)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `execute` returns the `Order` when found, `null` when not found
- [x] Gate check passes: `npm test -- get-order.use-case`
- [x] Test count: ≥ 2 tests pass (found, not found) — 2 tests

**Tests**: unit
**Gate**: quick

---

### T10: Create request/response DTOs ✅ Done

**What**: Implement `CreateOrderDto` (with nested `CreateOrderItemDto`) and `OrderResponseDto` using `class-validator`/`class-transformer` decorators per spec validation rules (`customerId` uuid, `items` non-empty array, each item `sku` non-empty string, `quantity` positive, `unitPrice` >= 0).
**Where**: `src/order/infrastructure/http/dto/create-order.dto.ts`, `src/order/infrastructure/http/dto/order-response.dto.ts`
**Depends on**: None (pure DTO shapes; validated end-to-end in T13)
**Reuses**: nothing
**Requirement**: ORD0-02 (AC2, AC3, AC4), edge case (sku vazio)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `CreateOrderDto`: `customerId` (`@IsUUID`), `items` (`@ArrayNotEmpty`, `@ValidateNested({ each: true })`)
- [x] `CreateOrderItemDto`: `sku` (`@IsString`, `@IsNotEmpty`), `quantity` (`@IsPositive`), `unitPrice` (`@Min(0)`)
- [x] `OrderResponseDto` fields match spec response shape (`orderId, customerId, items, status, totalAmount, createdAt`)
- [x] Gate check passes: `npm run build`

**Tests**: none (matrix: DTO/config → none; validation behavior is verified at e2e level in T13, per "merge forward" rule)
**Gate**: build

---

### T11: Create `OrderExceptionFilter` ✅ Done

**What**: Implement a Nest exception filter mapping `DomainError` → 400, `NotFoundException` → 404 (passthrough), any other unhandled error → 500 with a generic body (no internal details/stack exposed).
**Where**: `src/order/infrastructure/http/order-exception.filter.ts`, `src/order/infrastructure/http/order-exception.filter.spec.ts`
**Depends on**: T3 (DomainError)
**Reuses**: `DomainError`
**Requirement**: ORD0-01 (AC5), ORD0-02 (AC2, AC3, AC4)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `DomainError` (and subclasses) mapped to HTTP 400 with the error message
- [x] `NotFoundException` passes through as 404 (implemented as passthrough of any Nest `HttpException`, so ValidationPipe's `BadRequestException` also passes through with its own status instead of being swallowed into 500 — SPEC_DEVIATION, see note below)
- [x] Any other `Error` mapped to HTTP 500 with a generic body (e.g. `{ message: "Internal server error" }`), no stack/internal detail leaked
- [x] Gate check passes: `npm test -- order-exception.filter`
- [x] Test count: ≥ 3 tests pass (DomainError→400, NotFoundException→404, generic Error→500 with generic body) — 3 tests

**SPEC_DEVIATION**: filter catches `HttpException` broadly (not just `NotFoundException`) so it passes through any Nest-thrown HTTP exception (status + body) unchanged.
**Reason**: the original `@Catch()` + `instanceof NotFoundException` design mapped every other exception — including `ValidationPipe`'s `BadRequestException` — to 500, which broke every DTO-validation 400 case exercised in T13's e2e suite.

**Tests**: unit
**Gate**: quick

---

### T12: Wire `OrdersModule` (in-memory default) + global `ValidationPipe` ✅ Done

**What**: Create `OrdersModule` binding `ORDER_REPOSITORY` token to `InMemoryOrderRepository` when `PERSISTENCE_PROVIDER` is unset or `IN_MEMORY` (via `useFactory`, per AD-002); register `CreateOrderUseCase`, `GetOrderUseCase`; import into `AppModule`; add global `ValidationPipe` (`whitelist: true, forbidNonWhitelisted: true`) in `main.ts`.
**Where**: `src/order/order.module.ts`, `src/app.module.ts` (modify), `src/main.ts` (modify)
**Depends on**: T8 (CreateOrderUseCase), T9 (GetOrderUseCase), T7 (InMemoryOrderRepository)
**Reuses**: `src/app.module.ts`, `src/main.ts`
**Requirement**: ORD0-01, ORD0-03, ORD0-05 (provider switch scaffold — Postgres branch added in T21)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `OrdersModule` provides `ORDER_REPOSITORY` via `useFactory` reading `process.env.PERSISTENCE_PROVIDER`, defaulting to `InMemoryOrderRepository`
- [x] `AppModule` imports `OrdersModule`
- [x] `main.ts` registers global `ValidationPipe`
- [x] Gate check passes: `npm run build`
- [x] App boots successfully: `npm run start` exits 0 within a short-lived check (or equivalent Nest testing module bootstrap in a smoke test)

**Tests**: none (wiring only; exercised through T13's e2e tests)
**Gate**: build

---

### T13: Implement `OrdersController` + full e2e suite ✅ Done

**What**: Implement `POST /orders` and `GET /orders/:id` per design interfaces, apply `OrderExceptionFilter`, use `ParseUUIDPipe` on the `:id` param; write the e2e suite covering every AC of ORD0-01, ORD0-02, ORD0-03 and the spec's edge cases.
**Where**: `src/order/infrastructure/http/orders.controller.ts`, `test/orders.e2e-spec.ts`
**Depends on**: T10 (DTOs), T11 (ExceptionFilter), T12 (OrdersModule wiring)
**Reuses**: `CreateOrderUseCase`, `GetOrderUseCase`, `CreateOrderDto`, `OrderResponseDto`, `OrderExceptionFilter`, `ParseUUIDPipe` (Nest built-in)
**Requirement**: ORD0-01 (AC1-5), ORD0-02 (AC1-4), ORD0-03 (AC1-3), edge cases (sku vazio, id inválido em GET, corpo não-JSON)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `POST /orders` valid payload → 201 with `{ orderId, status, totalAmount, createdAt }`, total matches manual sum
- [x] `POST /orders` empty `items` → 400, nothing persisted (verified structurally: `class-validator`'s `@ArrayNotEmpty` rejects the request in `ValidationPipe`, before the use case/repository is ever invoked)
- [x] `POST /orders` item with `quantity <= 0` or `unitPrice < 0` → 400, nothing persisted (same structural guarantee — `@IsPositive`/`@Min(0)` reject before persistence)
- [x] `POST /orders` missing/invalid `customerId` → 400, nothing persisted (`@IsUUID` rejects before persistence)
- [x] `POST /orders` item with empty/missing `sku` → 400
- [x] `POST /orders` malformed JSON body → 400 (default Nest body-parser behavior, no custom handling)
- [x] `GET /orders/:id` existing order → 200 with full order shape matching what was created
- [x] `GET /orders/:id` non-existent (valid uuid) → 404
- [x] `GET /orders/:id` invalid uuid format → 400
- [x] Gate check passes: `npm test && npm run test:e2e`
- [x] Test count: ≥ 9 e2e tests pass (one per AC/edge case above), 0 skipped/deleted — 10 tests (`test/orders.e2e-spec.ts`); also fixed pre-existing `test/jest-e2e.json` missing `@/` path-alias mapping, which had `test/app.e2e-spec.ts` failing to even load

**Tests**: e2e
**Gate**: full

**Commit**: `feat(order): implement POST /orders and GET /orders/:id`

---

### T14: Add Swagger/OpenAPI documentation ✅ Done

**What**: Bootstrap `@nestjs/swagger` in `main.ts` exposing `/api-docs`; add `@ApiProperty`/`@ApiOperation`/`@ApiResponse` decorators to DTOs and controller covering request/response/400/404/500.
**Where**: `src/main.ts` (modify), `src/order/infrastructure/http/dto/create-order.dto.ts` (modify), `src/order/infrastructure/http/dto/order-response.dto.ts` (modify), `src/order/infrastructure/http/orders.controller.ts` (modify)
**Depends on**: T13 (controller must exist)
**Reuses**: `@nestjs/swagger` (new dependency)
**Requirement**: ORD0-07 (AC1)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `@nestjs/swagger` added to `package.json` dependencies
- [x] `/api-docs` reachable when app runs in dev mode, rendering Swagger UI
- [x] `POST /orders` and `GET /orders/:id` documented with request/response schemas and 400/404/500 responses
- [x] Gate check passes: `npm run build && npm run test:e2e` (existing e2e suite from T13 still green — decorators must not change runtime validation behavior)

**Tests**: none (matrix: doc annotations → none; regression coverage inherited from T13's e2e suite)
**Gate**: full

---

### T15: Configure `dependency-cruiser` architecture lint

**What**: Add `dependency-cruiser` as a dev dependency; create `.dependency-cruiser.js` forbidding imports from `src/order/domain/**` or `src/order/application/**` into `src/order/infrastructure/**`, `typeorm`, `@nestjs/typeorm`, or any messaging SDK (`aws-sdk`, `@aws-sdk/*`, `amqplib`, etc. — pattern-based, forward-looking for Fase 1); add `npm run lint:arch` script.
**Where**: `.dependency-cruiser.js` (new, root), `package.json` (add script + devDependency)
**Depends on**: T13 (domain/application/infrastructure boundaries must all exist to validate against)
**Reuses**: nothing
**Requirement**: ORD0-06 (AC1)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `npm run lint:arch` passes with 0 violations against current codebase
- [ ] Manual verification (per spec's Independent Test): temporarily add a forbidden import (e.g. `typeorm` import in `order.aggregate.ts`), run `npm run lint:arch`, confirm it fails with a clear message identifying the forbidden edge; remove the import, confirm it passes again
- [ ] Gate check passes: `npm run build`

**Tests**: none (manual verification per spec's own acceptance test; no automated test harness for lint config itself)
**Gate**: build

---

### T16: Add CI workflow with blocking architecture lint step

**What**: Create a GitHub Actions workflow running on PRs: install deps, `npm run build`, `npm run lint`, `npm run lint:arch`, `npm test`, `npm run test:e2e`; `lint:arch` must be a required (non-continue-on-error) step.
**Where**: `.github/workflows/ci.yml` (new)
**Depends on**: T15 (`lint:arch` script must exist)
**Reuses**: scripts from `package.json`
**Requirement**: ORD0-06 (AC2)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Workflow triggers on `pull_request` (and reasonably on `push` to `main`)
- [ ] `lint:arch` step has no `continue-on-error: true` and runs before/alongside other required steps
- [ ] Workflow YAML is valid (verified via `actionlint` if available, otherwise via GitHub Actions syntax review — no local runtime to execute this task's own gate)

**Tests**: none (CI config; verified by an actual CI run once pushed — out of scope to execute locally)
**Gate**: build (YAML syntax + script references check only)

---

### T17: Add TypeORM entities for the `order` schema

**What**: Add `typeorm`, `@nestjs/typeorm`, `pg` dependencies; implement `OrderEntity` and `OrderItemEntity` per design's Data Models section (`numeric(12,2)` columns, `OneToMany`/`ManyToOne` relation, `cascade`/`eager` on the parent side).
**Where**: `src/order/infrastructure/persistence/typeorm/order.entity.ts`, `src/order/infrastructure/persistence/typeorm/order-item.entity.ts`
**Depends on**: T13 (domain stable)
**Reuses**: nothing
**Requirement**: ORD0-05 (schema)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `OrderEntity`/`OrderItemEntity` match the design's column types exactly (`numeric(12,2)` for money columns, `uuid` PKs, `timestamptz` for `createdAt`)
- [ ] Relation configured with cascade insert from `OrderEntity` → `OrderItemEntity`
- [ ] Gate check passes: `npm run build`

**Tests**: none (matrix: Entity/config → none; correctness verified via mapper unit tests in T18 and integration tests in T22)
**Gate**: build

---

### T18: Implement domain ↔ TypeORM entity mapper

**What**: Implement bidirectional mapper converting `Order`/`OrderItem` (domain, `Money` in cents) ↔ `OrderEntity`/`OrderItemEntity` (ORM, `numeric` as string), per AD-004 (never expose raw `numeric` string to domain, never expose `Money`/cents to the ORM layer).
**Where**: `src/order/infrastructure/persistence/typeorm/order.mapper.ts`, `src/order/infrastructure/persistence/typeorm/order.mapper.spec.ts`
**Depends on**: T17 (entities), T5 (Order)
**Reuses**: `Order`, `OrderItem`, `Money`, `OrderEntity`, `OrderItemEntity`
**Requirement**: ORD0-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `toEntity(order: Order): OrderEntity` and `toDomain(entity: OrderEntity): Order` implemented, round-tripping every field including nested items
- [ ] Money round-trips exactly (no precision loss) across `Money` (cents) → `numeric` string → `Money` (cents)
- [ ] Gate check passes: `npm test -- order.mapper`
- [ ] Test count: ≥ 3 tests pass (toEntity field mapping, toDomain field mapping, round-trip precision for a fractional-cents-risk value)

**Tests**: unit
**Gate**: quick

---

### T19: Implement `TypeOrmOrderRepository` adapter

**What**: Implement `OrderRepository` using TypeORM's `Repository<OrderEntity>`, via the mapper from T18.
**Where**: `src/order/infrastructure/persistence/typeorm/typeorm-order.repository.ts`
**Depends on**: T18 (mapper), T17 (entities)
**Reuses**: `OrderRepository` port, `order.mapper.ts`
**Requirement**: ORD0-05 (AC1)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `save`/`findById` implemented against the injected TypeORM `Repository<OrderEntity>`, delegating conversion to the mapper
- [ ] Gate check passes: `npm run build`

**Tests**: none at this task (exercised by T22's integration suite against real Postgres — merge-forward per Tasks process, since a real DB connection is required to test meaningfully)
**Gate**: build

---

### T20: Add initial Postgres migration

**What**: Generate/write the initial TypeORM migration creating `orders` and `order_items` tables matching the entities from T17 (AD-003: explicit migration, no `synchronize: true`).
**Where**: `src/order/infrastructure/persistence/typeorm/migrations/<timestamp>-init-order-schema.ts`, TypeORM CLI datasource config (e.g. `src/order/infrastructure/persistence/typeorm/data-source.ts`)
**Depends on**: T17 (entities)
**Reuses**: `OrderEntity`, `OrderItemEntity`
**Requirement**: ORD0-05, AD-003

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Migration creates `orders` and `order_items` tables with matching columns/types/FK (`ON DELETE CASCADE`)
- [ ] `synchronize` is `false` in the TypeORM datasource config used by this migration and by the app's Postgres connection
- [ ] Gate check passes: `npm run build`

**Tests**: none (schema migration; correctness verified by T22 running the app against it)
**Gate**: build

---

### T21: Wire `PERSISTENCE_PROVIDER=POSTGRES` branch into `OrdersModule`

**What**: Extend the `useFactory` from T12 to bind `ORDER_REPOSITORY` to `TypeOrmOrderRepository` when `PERSISTENCE_PROVIDER=POSTGRES`, registering `TypeOrmModule.forFeature([OrderEntity, OrderItemEntity])` and the Postgres `TypeOrmModule.forRootAsync` connection (reading `DATABASE_URL` or equivalent env vars) conditionally.
**Where**: `src/order/order.module.ts` (modify)
**Depends on**: T19 (TypeOrmOrderRepository), T12 (existing module wiring)
**Reuses**: `OrdersModule` (T12), `TypeOrmOrderRepository`
**Requirement**: ORD0-05 (AC1)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `PERSISTENCE_PROVIDER=IN_MEMORY` (or unset) still binds `InMemoryOrderRepository` — no regression (re-run T13's e2e suite)
- [ ] `PERSISTENCE_PROVIDER=POSTGRES` binds `TypeOrmOrderRepository`, connecting via env-configured `DataSource`
- [ ] Gate check passes: `npm test && npm run test:e2e` (in-memory path, default env)
- [ ] Gate check passes: `npm run build`

**Tests**: none additional (in-memory regression covered by existing T13 suite; Postgres path covered by T22)
**Gate**: full

---

### T22: Integration tests for the Postgres adapter (Testcontainers)

**What**: Add `@testcontainers/postgresql` (or equivalent) as a dev dependency; write an integration/e2e suite that boots a real Postgres container, runs the T20 migration, sets `PERSISTENCE_PROVIDER=POSTGRES`, and re-runs the same acceptance assertions as T13's `POST /orders`/`GET /orders/:id` suite against this adapter.
**Where**: `test/orders-postgres.e2e-spec.ts`
**Depends on**: T21 (Postgres wiring), T20 (migration), T13 (reference assertions to replicate)
**Reuses**: `test/orders.e2e-spec.ts` assertions (replicated, not imported, since the two suites boot different module configurations)
**Requirement**: ORD0-05 (AC2)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Testcontainers spins up a disposable Postgres instance for the suite
- [ ] Migration from T20 runs against it before tests execute
- [ ] `POST /orders` + `GET /orders/:id` acceptance assertions from T13 pass identically against the Postgres-backed app instance
- [ ] Gate check passes: `npm run test:e2e -- orders-postgres`
- [ ] Test count: ≥ 5 tests pass (parity subset of T13: create success, one validation 400 case, get success, get 404, get invalid id 400) — full parity with T13's 9 is preferred if time allows, 5 is the floor for "same acceptance suite" per spec's Independent Test

**Tests**: integration
**Gate**: full

**Commit**: `feat(order): add Postgres persistence adapter with TypeORM`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phase 1:  T1 ──→ T2 ──→ T3 ──→ T4 ──→ T5 ──→ T6
Phase 2:  T7 ──→ T8 ──→ T9
Phase 3:  T10 ──→ T11 ──→ T12 ──→ T13 ──→ T14
Phase 4:  T15 ──→ T16
Phase 5:  T17 ──→ T18 ──→ T19 ──→ T20 ──→ T21 ──→ T22
```

Execution is strictly sequential — there is no intra-phase parallelism. A single agent (or batch worker) works one task at a time, in order.

**Note on Phase 3 → Phase 5 ordering**: Phase 5 (architecture lint) depends on T13, not on Phase 4 (Swagger, independent P3 documentation work). Phases still run in the fixed order shown above for simplicity of sequencing; Phase 5 has no dependency on Phase 4's output, so this ordering is a scheduling choice, not a hard requirement — it may run before or after Phase 4 without correctness impact. Phase 6 depends on T13 (domain/infra boundary must be stable) but not on Phase 4 or Phase 5.

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1: Money VO | 1 file (VO + arithmetic) | ✅ Granular |
| T2: OrderStatus VO | 1 file (enum) | ✅ Granular |
| T3: Domain error hierarchy | 3 small files, one cohesive concept (error types) | ✅ Granular (cohesive) |
| T4: OrderItem entity | 1 file | ✅ Granular |
| T5: Order aggregate | 1 file | ✅ Granular |
| T6: OrderRepository port + coverage config | 1 interface + 1 config edit, cohesive "close out domain phase" step | ✅ Granular (cohesive) |
| T7: InMemoryOrderRepository | 1 file | ✅ Granular |
| T8: CreateOrderUseCase | 1 file (+ DI token) | ✅ Granular |
| T9: GetOrderUseCase | 1 file | ✅ Granular |
| T10: DTOs | 2 small cohesive files (request/response contract) | ✅ Granular (cohesive) |
| T11: OrderExceptionFilter | 1 file | ✅ Granular |
| T12: OrdersModule wiring | 1 new file + 2 small edits, one wiring concern | ✅ Granular (cohesive) |
| T13: OrdersController + e2e | 1 controller file + 1 test file, one endpoint pair | ✅ Granular |
| T14: Swagger docs | Decorator additions across existing files, one concern (docs) | ✅ Granular (cohesive) |
| T15: dependency-cruiser config | 1 config file + 1 script | ✅ Granular |
| T16: CI workflow | 1 file | ✅ Granular |
| T17: TypeORM entities | 2 small cohesive files (parent/child schema) | ✅ Granular (cohesive) |
| T18: Mapper | 1 file | ✅ Granular |
| T19: TypeOrmOrderRepository | 1 file | ✅ Granular |
| T20: Migration | 1 migration + datasource config | ✅ Granular (cohesive) |
| T21: Postgres module wiring | 1 file edit | ✅ Granular |
| T22: Postgres integration tests | 1 file | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|---|---|---|---|
| T1 | None | (phase start) | ✅ Match |
| T2 | None | T1 → T2 | ✅ Match (no real dependency; sequenced for phase-order only) |
| T3 | None | T2 → T3 | ✅ Match (sequenced, no real dependency) |
| T4 | T1, T3 | T3 → T4 | ✅ Match |
| T5 | T1, T2, T3, T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 (phase boundary) | ✅ Match |
| T8 | T7, T5 | T7 → T8 | ✅ Match |
| T9 | T7 | T8 → T9 | ✅ Match (sequenced; no dependency on T8) |
| T10 | None | T9 → T10 (phase boundary) | ✅ Match (sequenced, no real dependency) |
| T11 | T3 | T10 → T11 | ✅ Match (sequenced; real dependency is T3, already satisfied earlier) |
| T12 | T8, T9, T7 | T11 → T12 | ✅ Match (sequenced; real dependencies already satisfied earlier) |
| T13 | T10, T11, T12 | T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 (phase boundary) | ✅ Match |
| T15 | T13 | T14 → T15 (phase boundary) | ✅ Match (sequenced; real dependency is T13, already satisfied) |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T13 | T16 → T17 (phase boundary) | ✅ Match (sequenced; real dependency is T13, already satisfied) |
| T18 | T17, T5 | T17 → T18 | ✅ Match |
| T19 | T18, T17 | T18 → T19 | ✅ Match |
| T20 | T17 | T19 → T20 | ✅ Match (sequenced; real dependency is T17, already satisfied) |
| T21 | T19, T12 | T20 → T21 | ✅ Match (sequenced; real dependencies already satisfied) |
| T22 | T21, T20, T13 | T21 → T22 | ✅ Match |

No task depends on a task in a later phase. ✅

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|---|---|---|---|---|
| T1: Money VO | Domain | unit | unit | ✅ OK |
| T2: OrderStatus VO | Entity/config | none | none | ✅ OK |
| T3: Domain errors | Entity/config | none | none | ✅ OK |
| T4: OrderItem entity | Domain | unit | unit | ✅ OK |
| T5: Order aggregate | Domain | unit | unit | ✅ OK |
| T6: OrderRepository port + coverage config | Entity/config | none | none | ✅ OK |
| T7: InMemoryOrderRepository | Persistence adapter | unit | unit | ✅ OK |
| T8: CreateOrderUseCase | Application | unit | unit | ✅ OK |
| T9: GetOrderUseCase | Application | unit | unit | ✅ OK |
| T10: DTOs | HTTP/DTO | none (deferred to T13 e2e, per merge-forward rule) | none | ✅ OK |
| T11: OrderExceptionFilter | HTTP | unit | unit | ✅ OK |
| T12: OrdersModule wiring | Config/wiring | none | none | ✅ OK |
| T13: OrdersController + e2e | HTTP controller (+ DTOs from T10 exercised here) | e2e | e2e | ✅ OK |
| T14: Swagger docs | Doc annotations | none | none | ✅ OK |
| T15: dependency-cruiser config | Architecture lint config | none (manual verification per spec) | none | ✅ OK |
| T16: CI workflow | CI config | none | none | ✅ OK |
| T17: TypeORM entities | Entity/config | none | none | ✅ OK |
| T18: Mapper | Persistence adapter (pure function) | unit | unit | ✅ OK |
| T19: TypeOrmOrderRepository | Persistence adapter (DB-dependent) | integration (deferred to T22, per merge-forward rule — cannot be meaningfully unit-tested without a real/near-real DB) | none (exercised in T22) | ✅ OK |
| T20: Migration | Schema/config | none | none | ✅ OK |
| T21: Postgres module wiring | Config/wiring | none (in-memory regression re-run, no new tests) | none | ✅ OK |
| T22: Postgres integration tests | Persistence adapter (integration) | integration | integration | ✅ OK |

All rows ✅. No `Tests: none` claim rests on "tested in another task" without an explicit merge-forward justification (T10 → T13, T19 → T22) recorded above.

---

## Tips

- **Phases are ordered** — Each phase completes before the next; tasks run in order within a phase
- **Reuses = Token saver** — Always reference existing code
- **Tools per task** — MCPs and Skills prevent wrong approaches
- **Dependencies are gates** — Clear what blocks what
- **Done when = Testable** — If you can't verify it, rewrite it
- **Requirement ID = Traceable** — Every task traces back to a spec requirement
- **One commit per task** — Plan the commit message format in advance
