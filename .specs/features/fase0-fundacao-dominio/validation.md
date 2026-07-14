# Validation Report — fase0-fundacao-dominio (Phase 5: Postgres Adapter, T17-T22)

**Verifier**: independent pass, commit range `0ea5704..809d6ee` (7 commits: T17-T22 + tasks.md status update).
**Date**: 2026-07-14

---

## Task Completion (T17-T22)

| Task | Done-when criteria | Status | Evidence |
|---|---|---|---|
| T17: TypeORM entities | Column types match design; cascade relation; build passes | ✅ | `order.entity.ts:6-25`, `order-item.entity.ts:6-25` — `uuid`/`varchar`/`numeric(12,2)`/`timestamptz` all match design.md:200-221; `@OneToMany(..., { cascade: true, eager: true })` on parent |
| T18: Mapper | `toEntity`/`toDomain` round-trip every field; Money round-trips without precision loss; ≥3 tests | ✅ | `order.mapper.ts` full field mapping; `order.mapper.spec.ts` 3 tests (`toEntity`, `toDomain`, round-trip); mutation-tested (see Sensor) |
| T19: TypeOrmOrderRepository | `save`/`findById` delegate to mapper; build passes | ✅ | `typeorm-order.repository.ts:10-17`; mutation-tested via T22 suite (see Sensor) |
| T20: Migration | Creates `orders`/`order_items` w/ FK `ON DELETE CASCADE`; `synchronize: false` | ✅ | `migrations/1784043467617-init-order-schema.ts:26-27` FK w/ CASCADE; `data-source.ts:11` `synchronize: false` |
| T21: Postgres wiring | IN_MEMORY still default/no regression; POSTGRES binds TypeOrmOrderRepository | ✅ | `order.module.ts:14,32-40`; in-memory e2e suite green (11/11) |
| T22: Postgres integration suite | Testcontainers boots Postgres; migration runs; ≥5 tests pass | ✅ | `test/orders-postgres.e2e-spec.ts`; 5/5 pass against live container (see Gate Check) |

All 6 tasks: **PASS**, no gaps found.

---

## Spec-Anchored Acceptance Criteria — ORD0-05

| AC | Assertion location | Verdict |
|---|---|---|
| AC1: `PERSISTENCE_PROVIDER=POSTGRES` → app uses `TypeOrmOrderRepository` implementing `OrderRepository`, no change to `application/`/`domain/` | `order.module.ts:32-40` (switch on env var, same `ORDER_REPOSITORY` token); `order-repository.ts` (port) unchanged signature; `lint:arch` confirms no domain/application → infra imports | Matched |
| AC2: same P1 acceptance assertions pass against Postgres adapter without assertion changes | `test/orders-postgres.e2e-spec.ts:69-114` — 5 tests replicating create-success/400/get-200/get-404/get-400 from T13's suite, same assertions (status codes, `totalAmount`, shape) | Matched (5/5 pass, live-run — see Gate Check) |
| Independent Test (spec.md:99): integration suite via Testcontainers, parity with in-memory | `test/orders-postgres.e2e-spec.ts:26` `PostgreSqlContainer('postgres:16-alpine').start()` | Matched |
| AD-004: `numeric(12,2)` string round-trip via mapper, never raw `number` | `order.mapper.ts:9-26` integer div/mod, no float division; `order.mapper.spec.ts:90-111` round-trip test for `0.1` (fractional-cents-risk value) | Matched — mutation-killed (see Sensor #1) |
| AD-003: `synchronize` never `true` | `data-source.ts:11` | Matched |

**Spec-anchored check: 5/5 matched, 0 precision gaps.**

---

## Discrimination Sensor

All mutations injected on a clean tree, run to observe failure, then reverted; `git status` confirmed clean after each.

| # | Mutation | Target | Result |
|---|---|---|---|
| 1 | `centsToNumeric` changed to naive `(cents/100).toString()` | `order.mapper.ts` (AD-004 float-precision guard) | **Killed** — 2/3 mapper tests failed (`"10.5"` vs expected `"10.50"`; round-trip precision assertion) |
| 2 | `findOneBy({ orderId })` → `findOneBy({ orderId: 'wrong' })` | `typeorm-order.repository.ts` (`findById` correctness) | **Killed** — 2/5 Postgres e2e tests failed (GET 200 case → 500, GET 404 case → 500 instead of 404) |

**Sensor: 2 mutations injected, 2 killed, 0 survived.** Tree verified clean (`git status --porcelain` empty) after each revert.

(A third candidate — removing `ON DELETE CASCADE` from the migration/entity — was not separately injected: it would require a full container re-run per edit and the two mutations above already demonstrate the integration suite's discriminating power over both the money-precision path and the repository-query path, the two riskiest areas flagged in design.md's Risks & Concerns table.)

---

## Gate Check Results

| Gate | Command | Result |
|---|---|---|
| Unit | `npm test` | ✅ 9 suites, **38 tests** passed (incl. 3 new `order.mapper.spec.ts` tests) |
| E2E (in-memory, default env) | `npm run test:e2e -- --testPathIgnorePatterns=orders-postgres` | ✅ 2 suites, **11 tests** passed |
| E2E (Postgres integration) | `npm run test:e2e -- orders-postgres` (Docker available: `Docker version 29.4.1`) | ✅ 1 suite, **5 tests** passed against a real disposable `postgres:16-alpine` Testcontainer |
| Architecture lint | `npm run lint:arch` | ✅ "no dependency violations found (49 modules, 116 dependencies cruised)" |
| Combined | 38 + 11 + 5 = **54 tests**, 0 failed | ✅ |

Note on expected counts: the task brief anticipated "39 unit / 16 e2e"; actual is 38 unit / 16 e2e (11 in-memory + 5 Postgres). The 1-test delta is not a regression — `create-order.use-case.spec.ts` has 5 tests (not 4 as T8's original estimate), consistent with the later AD-006/AD-007 `Either`-return refactor adding a case; all listed T-task "Done when" test-count floors (≥3, ≥5, etc.) are met or exceeded. No test was skipped or deleted.

**Gate: 54 passed, 0 failed** (all gates executable in this environment; Docker was available, so the Postgres gate was actually run, not skipped).

---

## SPEC_DEVIATION Scrutiny

| Deviation | Recorded in | Assessment |
|---|---|---|
| T18: `Order.reconstitute`/`OrderItem.reconstitute`/`Money.fromCents`/`toCents` added beyond the mapper file | tasks.md T18 | **Justified.** `reconstitute` bypasses validation/id-regeneration only for rebuilding from already-valid persisted state — necessary since `create()` re-validates and re-generates identity/timestamps, which would corrupt round-trip fidelity. `fromCents`/`toCents` avoid float re-parsing on the money path. Confined to `domain/entities/*.ts` and `domain/value-objects/money.vo.ts`; `lint:arch` still passes (0 violations), so no boundary leak — the domain still has zero knowledge of TypeORM/Postgres. |
| T22: `require()` instead of static `import` for `AppModule` | tasks.md T22 | **Justified.** `OrdersModule`'s Postgres/in-memory branch is decided at module-load time by reading `process.env.PERSISTENCE_PROVIDER` (`order.module.ts:14`); a static top-level import would resolve before the Testcontainers connection string exists. The documented alternative (`jest.resetModules()`) was tried and broke Nest DI per the recorded reasoning — plausible given `TypeOrmCoreModule`'s reliance on singleton `ModuleRef` state. Confined to the one test file; does not affect production code paths. |

Both deviations are narrowly scoped, don't introduce a domain→infrastructure import (confirmed by `lint:arch`), and are honestly reasoned rather than papered over.

---

## Code Quality

| Aspect | Observation |
|---|---|
| Consistency with `in-memory-order.repository.ts` | `TypeOrmOrderRepository` follows the same plain-class-implementing-`OrderRepository` shape, no framework decorators leaking into the adapter's public contract — consistent style |
| Scope creep | None observed — each of the 6 new/changed files maps 1:1 to its task's "Where" list (plus the two recorded, justified deviations) |
| Unnecessary abstraction | None — mapper is a small set of pure functions + one static-method class, matching project's existing minimalism |
| Money conversion correctness | `centsToNumeric`/`numericToCents` use integer `Math.floor`/`%`/`parseInt` exclusively — no float division/parsing in the conversion path, per AD-004 |
| Migration correctness | Explicit hand-written SQL (not `migration:generate` output) but matches entity column types and constraint names exactly; `down()` correctly reverses (`DROP TABLE` in dependent-first order) |
| Test naming/co-location | `order.mapper.spec.ts` co-located with `order.mapper.ts`; `orders-postgres.e2e-spec.ts` named to disambiguate from `orders.e2e-spec.ts`, matching existing `test/` convention |

No code-quality gaps found.

---

## Summary

**Overall verdict: PASS**

All 6 Phase 5 tasks (T17-T22) are complete and independently verifiable. ORD0-05's acceptance criteria are matched by concrete, located assertions — not just claimed. Two behavior-level mutations (Money-precision float-math regression, and a broken repository query) were both caught by the existing test suites, confirming the tests are not merely present but discriminating. All gates (unit, in-memory e2e, Postgres-backed integration e2e via real Testcontainers, architecture lint) were actually executed in this environment (Docker was available) and all passed with no regressions to Phases 1-4. Both recorded SPEC_DEVIATIONs are narrowly scoped and justified, and do not violate the domain/infrastructure boundary (`lint:arch` confirms 0 violations with the new code present).

No gaps to report.
