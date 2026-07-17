# Auth (Cognito M2M) Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/auth/design.md`
**Status**: ✅ Execute concluído — T1-T16 done, Verifier: PASS (`.specs/features/auth/validation.md`, diff `dbcd8e5..HEAD` até `59ffa09`)

---

## Post-Verify Follow-ups (outside T1-T16, same Execute session)

Two gaps were found by manual UAT after the Verifier PASS — surfaced by the user, not covered by any of T1-T16's "Done when" criteria, and not spec ACs at the time. Implemented as one-off scoped changes rather than formal tasks (each single-concern, single-gate, one commit):

| # | What | Why (gap found) | Files | Commit |
| --- | --- | --- | --- | --- |
| F1 | `AuthStack` provisions a Cognito hosted domain (`userPool.addDomain(...)`) + `UserPoolTokenEndpoint` `CfnOutput` | `AuthStack` had User Pool + Resource Server + App Client but no `/oauth2/token` endpoint — no way to actually exchange `client_credentials` for a token (AUTH-04 AC1 was untestable end-to-end) | `infra/lib/auth-stack.ts`, `infra/test/auth-stack.test.ts` | `d7088d1` |
| F2 | Swagger docs moved from `orders/api-docs` to `/api-docs`, excluded from `ordersAuthorizer` at the `EdgeStack` level | Docs lived under `/orders/{proxy+}`, so the JWT authorizer blocked even the Swagger UI page load — same public-by-design precedent as `/health` (spec.md Edge Cases) | `src/main.ts`, `infra/lib/edge-stack.ts`, `infra/lib/compute-stack.ts`, `infra/lib/config.ts`, `infra/test/edge-stack.test.ts` | `7a2fdbc` |

Both gates passed (infra: 30 tests + `cdk synth`; app: 63 tests + `npm run build`) before commit. Not re-run through the full Verifier discrimination sensor (scope too small — config/wiring only, no new branch logic) — flagged here for traceability instead. See `spec.md`'s Requirement Traceability "Pós-Verify" note and `STATE.md` AD-023/AD-024.

---

## Test Coverage Matrix

> Generated from codebase sampling (`infra/test/*.test.ts`, `src/**/*.spec.ts`, `test/*.e2e-spec.ts`) and `jest.config`/`test/jest-e2e.json`. No `AGENTS.md`/`CLAUDE.md`/`CONTRIBUTING.md` testing guidelines found in the repo — strong defaults applied, floored by existing test depth.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| CDK stack (`AuthStack`, `EdgeStack`, `ComputeStack` changes) | unit (CDK assertions) | Key resource properties per AC (User Pool, Resource Server scope, App Client `client_credentials`, JWT authorizer wired to routes, throttle settings, new env vars on container) — same depth as existing `infra/test/*.test.ts` | `infra/test/*.test.ts` | `cd infra && npm test` |
| CDK synth (whole app) | build gate | `cdk synth` completes with no errors after each infra task | — | `cd infra && npx cdk synth` |
| NestJS guard/decorator/module (`shared/auth/**`) | unit | All branches; 1:1 to spec ACs (AUTH-01–03, AUTH-07); every listed edge case (no header, malformed header, expired/invalid signature, wrong issuer/audience, unexpected alg, JWKS fetch failure, invalid `AUTH_PROVIDER`) has a test | `src/shared/auth/**/*.spec.ts` | `npm test` |
| `AppModule`/`HealthController` wiring | unit | Existing `health.controller.spec.ts` still passes; `@Public()` presence verified | `src/shared/http/health.controller.spec.ts` | `npm test` |
| Routes / e2e (`orders`, `health`) | e2e | Happy path + auth edge cases: `AUTH_PROVIDER=NONE` unaffected (existing behavior), `AUTH_PROVIDER=COGNITO` rejects unauthenticated `/orders` calls with 401, `/health` stays public | `test/*.e2e-spec.ts` | `npm run test:e2e` |
| Entity/config only changes (e.g. `infra/lib/config.ts` throttle constants) | none | — build gate only | — | build gate only |

## Gate Check Commands

> Generated from `package.json` (root) and `infra/package.json`, matching the existing CI workflow (`.github/workflows/deploy-infra.yml`) and `aws-deploy`/`domain-foundation` precedent.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick (app) | After NestJS-only tasks with unit tests | `npm test` |
| Quick (infra) | After CDK-only tasks with unit tests | `cd infra && npm test` |
| Full (app) | After tasks touching routes/e2e/wiring | `npm test && npm run test:e2e` |
| Full (infra) | After tasks touching stack wiring across files | `cd infra && npm test && npx cdk synth` |
| Build | After phase completion | `npm run build && npm run lint && npm run lint:arch` (app) + `cd infra && npm run build && npx cdk synth` (infra) |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Infra — AuthStack (Cognito)

```
T1 → T2
```

### Phase 2: Infra — EdgeStack (JWT authorizer + throttle)

```
T3 → T4 → T5
```

### Phase 3: Infra — ComputeStack (env vars)

```
T6
```

### Phase 4: NestJS — guard core

```
T7 → T8 → T9 → T10 → T11 → T12
```

### Phase 5: Tests + e2e wiring

```
T13 → T14
```

### Phase 6: Roadmap / decision log

```
T15 → T16
```

---

## Task Breakdown

### T1: Create `AuthStack` (User Pool + Resource Server + App Client)

**What**: New `infra/lib/auth-stack.ts` provisioning a Cognito `UserPool`, a `UserPoolResourceServer` (`identifier: 'order-service'`) with one catch-all `ResourceServerScope` (`access`), and a `UserPoolClient` with `oAuth.flows.clientCredentials: true`, `generateSecret: true`, scoped to the catch-all scope. Exposes `userPool`, `userPoolClient`, `resourceServerIdentifier` as public readonly properties. `CfnOutput` for `userPoolId` and `userPoolClientId` (never the client secret).
**Where**: `infra/lib/auth-stack.ts`
**Depends on**: None
**Reuses**: `CfnOutput` pattern from `infra/lib/foundation-stack.ts`/`compute-stack.ts`; `serviceConfig` naming convention from `infra/lib/config.ts`
**Requirement**: AUTH-04, AUTH-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `AuthStack` compiles with no TypeScript errors
- [x] User Pool, Resource Server (1 scope), App Client (`clientCredentials: true`, `generateSecret: true`) are created
- [x] Client secret is never written to a `CfnOutput` (only `userPoolId`/`userPoolClientId` are)
- [x] Unit test asserts `AWS::Cognito::UserPool`, `AWS::Cognito::UserPoolResourceServer`, `AWS::Cognito::UserPoolClient` (with `AllowedOAuthFlows: ['client_credentials']`) via `Template.fromStack`
- [x] Gate check passes: `cd infra && npm test`
- [x] Test count: existing infra test count + new `auth-stack.test.ts` (report actual number in commit)

**Tests**: unit
**Gate**: quick (infra)

**Commit**: `feat(infra): add AuthStack with Cognito User Pool for M2M auth`

---

### T2: Wire `AuthStack` into `bin/app.ts`

**What**: Instantiate `new AuthStack(app, 'AuthStack')` in `infra/bin/app.ts`, no VPC/DB dependency (matches design: independent lifecycle).
**Where**: `infra/bin/app.ts`
**Depends on**: T1
**Reuses**: existing stack instantiation pattern in the same file
**Requirement**: AUTH-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `authStack` variable instantiated, no `addDependency` needed (no shared resources with Network/Database stacks)
- [x] `npx cdk synth` succeeds with `AuthStack` present in the synthesized app
- [x] Gate check passes: `cd infra && npx cdk synth`

**Tests**: none (wiring only, covered by build gate)
**Gate**: build (infra)

**Commit**: `feat(infra): instantiate AuthStack in CDK app`

---

### T3: Extend `EdgeStack` to accept Cognito props and attach `HttpJwtAuthorizer`

**What**: `EdgeStackProps` gains `userPool: cognito.IUserPool` and `userPoolClientId: string`. Both existing `addRoutes` calls (`{proxy+}` and root path for `/orders`) gain `authorizer: new HttpJwtAuthorizer('OrdersAuthorizer', userPool.userPoolProviderUrl, { jwtAudience: [userPoolClientId] })`.
**Where**: `infra/lib/edge-stack.ts` (modify)
**Depends on**: T1 (needs `AuthStack`'s exported types, not yet wired — wiring happens in T5)
**Reuses**: existing `addRoutes` calls at `infra/lib/edge-stack.ts:69-86`
**Requirement**: AUTH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Both `/orders` routes require the JWT authorizer (`AuthorizerType: JWT` in synthesized template)
- [x] Unit test asserts `AWS::ApiGatewayV2::Authorizer` with `AuthorizerType: JWT` and `AWS::ApiGatewayV2::Route` referencing it via `AuthorizerId`
- [x] Existing `edge-stack.test.ts` assertions (ALB internal, 404 default action, `/health` target group path) still pass unmodified
- [x] Gate check passes: `cd infra && npm test`

**Tests**: unit
**Gate**: quick (infra)

**Commit**: `feat(infra): attach Cognito JWT authorizer to orders routes`

---

### T4: Switch `HttpApi` to explicit stage with throttling

**What**: `new apigwv2.HttpApi(this, 'HttpApi', { createDefaultStage: false })`, followed by `httpApi.addStage('DefaultStage', { stageName: '$default', autoDeploy: true, throttle: { rateLimit, burstLimit } })`. Throttle values added as named constants in `infra/lib/config.ts` (e.g. `edgeThrottle: { rateLimit: 50, burstLimit: 100 }` — lab-scale defaults, not production sizing).
**Where**: `infra/lib/edge-stack.ts` (modify), `infra/lib/config.ts` (modify)
**Depends on**: T3
**Reuses**: `serviceConfig` object in `infra/lib/config.ts`
**Requirement**: AUTH-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `HttpApiUrl` `CfnOutput` still resolves to the `$default` stage (no URL/behavior regression)
- [x] Unit test asserts `AWS::ApiGatewayV2::Stage` with `StageName: '$default'`, `AutoDeploy: true`, and `DefaultRouteSettings`/`RouteSettings` throttle values matching config
- [x] `cdk diff` (or synth output review) confirms no unintended resource replacement of the existing stage
- [x] Gate check passes: `cd infra && npm test && npx cdk synth`

**Tests**: unit
**Gate**: full (infra)

**Commit**: `feat(infra): configure throttling on the HTTP API default stage`

---

### T5: Wire `AuthStack` outputs into `EdgeStack` (bin/app.ts)

**What**: Pass `userPool: authStack.userPool` and `userPoolClientId: authStack.userPoolClient.userPoolClientId` into `EdgeStack` instantiation in `infra/bin/app.ts`; add `edgeStack.addDependency(authStack)`.
**Where**: `infra/bin/app.ts` (modify)
**Depends on**: T2, T4
**Reuses**: existing `edgeStack.addDependency(...)` pattern
**Requirement**: AUTH-01, AUTH-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `npx cdk synth` succeeds end-to-end with `AuthStack` → `EdgeStack` dependency present
- [x] Gate check passes: `cd infra && npx cdk synth`

**Tests**: none (wiring only)
**Gate**: build (infra)

**Commit**: `feat(infra): wire AuthStack outputs into EdgeStack`

---

### T6: Add auth env vars to the Fargate container (`ComputeStack`)

**What**: `ComputeStackProps` gains `userPoolId: string` and `userPoolClientId: string`. Container `environment` gains `AUTH_PROVIDER: 'COGNITO'`, `COGNITO_USER_POOL_ID: props.userPoolId`, `COGNITO_CLIENT_ID: props.userPoolClientId` (no new secret — verification needs no client secret). `bin/app.ts` passes `authStack.userPool.userPoolId`/`authStack.userPoolClient.userPoolClientId` into `ComputeStack`, and `computeStack.addDependency(authStack)`.
**Where**: `infra/lib/compute-stack.ts` (modify), `infra/bin/app.ts` (modify)
**Depends on**: T2
**Reuses**: existing `environment`/`secrets` object at `infra/lib/compute-stack.ts:86-93`
**Requirement**: AUTH-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Unit test asserts the ECS `TaskDefinition` container has `AUTH_PROVIDER`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` in its `Environment` list
- [x] Existing `compute-stack.test.ts` assertions still pass unmodified
- [x] Gate check passes: `cd infra && npm test && npx cdk synth`

**Tests**: unit
**Gate**: full (infra)

**Commit**: `feat(infra): pass Cognito config to the order-service container`

---

### T7: Add `aws-jwt-verify` dependency

**What**: `npm install aws-jwt-verify` (pinned to `^5.2.1`, the version confirmed available via `npm view` during Design) in the root `package.json`.
**Where**: `package.json`, `package-lock.json`
**Depends on**: None
**Reuses**: N/A
**Requirement**: AUTH-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `aws-jwt-verify` present in `package.json` dependencies (not devDependencies — used at runtime)
- [x] `npm run build` succeeds
- [x] Gate check passes: `npm run build`

**Tests**: none (dependency-only change)
**Gate**: build

**Commit**: `chore(deps): add aws-jwt-verify for Cognito JWT verification`

---

### T8: Create `@Public()` decorator

**What**: `Public(): CustomDecorator` using `SetMetadata(IS_PUBLIC_KEY, true)`, with an exported `IS_PUBLIC_KEY` constant the guard will read via `Reflector`.
**Where**: `src/shared/auth/public.decorator.ts`
**Depends on**: None
**Reuses**: `@nestjs/common` `SetMetadata` (framework-native pattern, no existing project precedent)
**Requirement**: AUTH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `Public()` decorator exported, sets metadata key readable by `Reflector.getAllAndOverride`
- [x] Unit test verifies the decorator attaches the expected metadata to a test class/handler
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick (app)

**Commit**: `feat(auth): add Public decorator for guard opt-out`

---

### T9: Create `NoopAuthGuard`

**What**: `NoopAuthGuard implements CanActivate` — `canActivate(): boolean { return true; }`. Used when `AUTH_PROVIDER=NONE`.
**Where**: `src/shared/auth/noop-auth.guard.ts`
**Depends on**: None
**Reuses**: N/A
**Requirement**: AUTH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `NoopAuthGuard.canActivate()` always returns `true`
- [x] Unit test confirms `canActivate` returns `true` for an arbitrary `ExecutionContext`
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick (app)

**Commit**: `feat(auth): add NoopAuthGuard for AUTH_PROVIDER=NONE`

---

### T10: Create `CognitoAuthGuard`

**What**: `CognitoAuthGuard implements CanActivate`, constructor takes a `Reflector`. `canActivate`: (1) if `@Public()` metadata present on handler/class, return `true` immediately; (2) extract `Authorization` header, reject (throw `UnauthorizedException`) if missing or not `Bearer <token>`; (3) verify via `CognitoJwtVerifier.create({ userPoolId: process.env.COGNITO_USER_POOL_ID, tokenUse: 'access', clientId: process.env.COGNITO_CLIENT_ID })`, catching any verification error (expired, bad signature, wrong issuer/audience, unexpected `alg`, JWKS fetch failure) and rethrowing as `UnauthorizedException` (fail closed, per design Error Handling Strategy); (4) on success, read `client_id` from the verified payload and set `request.authClientId`, return `true`.
**Where**: `src/shared/auth/cognito-auth.guard.ts`
**Depends on**: T7, T8
**Reuses**: `aws-jwt-verify`'s `CognitoJwtVerifier` (built-in JWKS cache)
**Requirement**: AUTH-01, AUTH-02, AUTH-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Guard returns `true` without verifying when `@Public()` is present
- [x] Guard throws `UnauthorizedException` for: missing header, malformed header (no `Bearer ` prefix), expired token, invalid signature, wrong issuer/audience, unexpected algorithm, JWKS-fetch failure — each with a dedicated unit test using a locally-generated RSA test keypair (self-signed JWTs) and a mocked JWKS response (per design Risk mitigation — no dependency on real Cognito in tests)
- [x] Guard sets `request.authClientId` to the verified token's `client_id` claim on success
- [x] Every listed edge case from spec.md (`## Edge Cases`) has a corresponding test
- [x] Gate check passes: `npm test`
- [x] Test count: report actual number in commit (no silent deletions)

**Tests**: unit
**Gate**: quick (app)

**Commit**: `feat(auth): add CognitoAuthGuard with fail-closed JWT verification`

---

### T11: Create `AuthModule` (global `APP_GUARD` factory)

**What**: `@Global() @Module` providing `APP_GUARD` via `useFactory`, selecting `CognitoAuthGuard` (with a `new Reflector()`) or `NoopAuthGuard` based on `process.env.AUTH_PROVIDER ?? 'COGNITO'`; `default` branch throws `Error('Unsupported AUTH_PROVIDER: ...')` (mirrors `order.module.ts`'s pattern for `PERSISTENCE_PROVIDER`).
**Where**: `src/shared/auth/auth.module.ts`
**Depends on**: T9, T10
**Reuses**: `useFactory`/`switch`/`default`-throws pattern from `src/order/order.module.ts:14-15,32-42`
**Requirement**: AUTH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `AUTH_PROVIDER=NONE` resolves to `NoopAuthGuard`, `AUTH_PROVIDER=COGNITO` (or unset) resolves to `CognitoAuthGuard`, any other value throws at module instantiation
- [x] Unit test covers all three branches
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick (app)

**Commit**: `feat(auth): add AuthModule selecting the guard via AUTH_PROVIDER`

---

### T12: Wire `AuthModule` into `AppModule`, mark `HealthController` public

**What**: Import `AuthModule` in `src/app.module.ts`. Add `@Public()` to `HealthController.check()` (or the class) in `src/shared/http/health.controller.ts`.
**Where**: `src/app.module.ts` (modify), `src/shared/http/health.controller.ts` (modify)
**Depends on**: T8, T11
**Reuses**: existing `HealthController`/`AppModule`
**Requirement**: AUTH-01 (edge case: `/health` stays public)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `AppModule` imports `AuthModule`
- [x] `HealthController` carries `@Public()`
- [x] Existing `health.controller.spec.ts` still passes unmodified
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick (app)

**Commit**: `feat(auth): wire AuthModule into AppModule, mark health endpoint public`

---

### T13: Pin `AUTH_PROVIDER=NONE` in existing e2e specs

**What**: Add `process.env.AUTH_PROVIDER = 'NONE';` before the `require('@/app.module')` call in `test/orders.e2e-spec.ts`, `test/orders-postgres.e2e-spec.ts`, and `test/health.e2e-spec.ts` (mirroring the existing `PERSISTENCE_PROVIDER` pinning pattern), with the matching `delete process.env.AUTH_PROVIDER;` cleanup.
**Where**: `test/orders.e2e-spec.ts`, `test/orders-postgres.e2e-spec.ts`, `test/health.e2e-spec.ts` (all modify)
**Depends on**: T12
**Reuses**: existing `PERSISTENCE_PROVIDER` pinning pattern (`test/orders.e2e-spec.ts:22-30`)
**Requirement**: (regression guard for AUTH-03's default-`COGNITO` change)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] All 3 existing e2e specs pass with `AUTH_PROVIDER=NONE` pinned, unaffected by the new default
- [x] Gate check passes: `npm run test:e2e`

**Tests**: e2e
**Gate**: full (app)

**Commit**: `test(e2e): pin AUTH_PROVIDER=NONE for existing order/health e2e specs`

---

### T14: New e2e spec for the auth wiring

**What**: `test/auth.e2e-spec.ts` — with `AUTH_PROVIDER=COGNITO` (or unset, exercising the default) and dummy `COGNITO_USER_POOL_ID`/`COGNITO_CLIENT_ID` env vars, assert: `POST /orders` without `Authorization` header → 401; `GET /orders/:id` without header → 401; `GET /health` → 200 (public, unaffected by the guard). Does not attempt a valid-token happy path here (that requires real Cognito or JWKS mocking, already covered at the guard-unit level in T10 per design's Risk mitigation).
**Where**: `test/auth.e2e-spec.ts`
**Depends on**: T13
**Reuses**: e2e bootstrap pattern from `test/orders.e2e-spec.ts`
**Requirement**: AUTH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] 3 new e2e tests pass (`/orders` POST 401, `/orders/:id` GET 401, `/health` 200)
- [x] Gate check passes: `npm run test:e2e`
- [x] Test count: report actual number in commit (no silent deletions)

**Tests**: e2e
**Gate**: full (app)

**Commit**: `test(e2e): add auth wiring e2e spec (unauthenticated 401, health stays public)`

---

### T15: Update `ROADMAP.md` — insert Auth as the new Fase 1

**What**: Insert a new "Fase 1 — Autenticação e autorização (Cognito M2M)" section (objetivo, critério de saída, status, regra de deploy referencing `AuthStack`) right after the current Fase 0 section. Renumber the existing "Fase 1 — Mensageria..." to "Fase 2" and "Fase 2 — RabbitMQ..." to "Fase 3". Update the `## Milestones` table (`M1` → auth DoD, `M2` → messaging DoD depends on M1, `M3` → RabbitMQ depends on M2) and the "Perguntas em aberto" section's phase references if any point to the old numbering.
**Where**: `.specs/project/ROADMAP.md` (modify)
**Depends on**: T14
**Reuses**: existing section structure/format
**Requirement**: N/A (project memory, not a spec AC)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Auth is "Fase 1", messaging-flow is "Fase 2", RabbitMQ is "Fase 3", milestones renumbered consistently
- [x] No dangling reference to the old numbering remains in the file

**Tests**: none (documentation)
**Gate**: build (n/a — manual review)

**Commit**: `docs(roadmap): insert Cognito auth as Fase 1, renumber messaging/RabbitMQ phases`

---

### T16: Record `AD-NNN` decisions and update `STATE.md` Handoff

**What**: Append the next `AD-NNN` entries to `.specs/project/STATE.md` `## Decisions`: (a) `AuthStack` as a new independent CDK stack for Cognito M2M (extends AD-017's "new stack when lifecycle doesn't fit"), (b) global `APP_GUARD` + `@Public()` guard strategy (Approach A), (c) `AUTH_PROVIDER` default `COGNITO` (mirrors AD-009's pattern), (d) the catch-all Resource Server scope as an infra requirement, not an authz decision, (e) `request.authClientId` exposure for observability. Update the `## Handoff` section: feature status, phase/task, completed/in-progress, next step.
**Where**: `.specs/project/STATE.md` (modify)
**Depends on**: T15
**Reuses**: existing `AD-NNN` numbering/format in the same file
**Requirement**: N/A (project memory)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] New `AD-NNN` entries appended (continuing from the last existing number), each with Motivo
- [x] `## Handoff` reflects `auth` feature Execute completion and next step (Verifier, then resume `messaging-flow` Design)

**Tests**: none (documentation)
**Gate**: build (n/a — manual review)

**Commit**: `docs(state): record AuthStack/guard decisions, update handoff`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phase 1:  T1 ──→ T2
Phase 2:  T3 ──→ T4 ──→ T5
Phase 3:  T6
Phase 4:  T7 ──→ T8 ──→ T9 ──→ T10 ──→ T11 ──→ T12
Phase 5:  T13 ──→ T14
Phase 6:  T15 ──→ T16
```

Execution is strictly sequential — there is no intra-phase parallelism. A single agent (or batch worker) works one task at a time, in order.

**Batching note**: 16 tasks total → packs into 3 batches of ~5-6 tasks each (whole phases, cut at phase boundaries): Batch 1 = Phases 1-3 (T1-T6, infra), Batch 2 = Phase 4 (T7-T12, NestJS core), Batch 3 = Phases 5-6 (T13-T16, tests + docs). Per the skill, since total tasks (16) exceed the ~8-task single-batch threshold, sub-agent delegation will be offered before Execute begins.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Create AuthStack | 1 file (1 stack, 3 related Cognito resources — cohesive) | ✅ Granular |
| T2: Wire AuthStack into bin/app.ts | 1 file change | ✅ Granular |
| T3: Attach JWT authorizer to EdgeStack routes | 1 file (existing routes, add 1 concern) | ✅ Granular |
| T4: Explicit stage + throttle | 2 files (stack + config constants — cohesive, same concern) | ✅ Granular |
| T5: Wire AuthStack → EdgeStack | 1 file change | ✅ Granular |
| T6: Env vars on ComputeStack | 2 files (stack + bin wiring — cohesive, same concern) | ✅ Granular |
| T7: Add aws-jwt-verify dependency | 1 file change (package.json) | ✅ Granular |
| T8: Public decorator | 1 file, 1 concept | ✅ Granular |
| T9: NoopAuthGuard | 1 file, 1 concept | ✅ Granular |
| T10: CognitoAuthGuard | 1 file, 1 concept (verification logic) | ✅ Granular |
| T11: AuthModule | 1 file, 1 concept (guard selection) | ✅ Granular |
| T12: Wire AuthModule + mark health public | 2 files (cohesive: both are "turn the guard on") | ✅ Granular |
| T13: Pin AUTH_PROVIDER=NONE in existing e2e | 3 files (same one-line change, cohesive) | ✅ Granular |
| T14: New auth e2e spec | 1 file, 1 concept | ✅ Granular |
| T15: ROADMAP.md update | 1 file | ✅ Granular |
| T16: STATE.md update | 1 file | ✅ Granular |

**Granularity check**: all 16 tasks are single-file or cohesive 2-3-file changes around one concern — no splitting needed.

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (start of Phase 1) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T1 | T1 → T3 (cross-phase, Phase 1 → Phase 2) | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T2, T4 | T2 → T5, T4 → T5 (cross-phase) | ✅ Match |
| T6 | T2 | T2 → T6 (cross-phase, Phase 1 → Phase 3) | ✅ Match |
| T7 | None | (start of Phase 4) | ✅ Match |
| T8 | None | (start of Phase 4) | ✅ Match |
| T9 | None | (start of Phase 4) | ✅ Match |
| T10 | T7, T8 | T7 → T10, T8 → T10 | ✅ Match |
| T11 | T9, T10 | T9 → T11, T10 → T11 | ✅ Match |
| T12 | T8, T11 | T8 → T12, T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 (cross-phase, Phase 4 → Phase 5) | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | T14 | T14 → T15 (cross-phase, Phase 5 → Phase 6) | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |

No task depends on a task in a later phase — all dependencies point backward or within the same phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1: AuthStack | CDK stack | unit | unit | ✅ OK |
| T2: Wire AuthStack in bin/app.ts | wiring only | none (build gate) | none | ✅ OK |
| T3: JWT authorizer on EdgeStack | CDK stack | unit | unit | ✅ OK |
| T4: Explicit stage + throttle | CDK stack | unit | unit | ✅ OK |
| T5: Wire AuthStack → EdgeStack | wiring only | none (build gate) | none | ✅ OK |
| T6: Env vars on ComputeStack | CDK stack | unit | unit | ✅ OK |
| T7: aws-jwt-verify dependency | dependency only | none (build gate) | none | ✅ OK |
| T8: Public decorator | NestJS unit (decorator) | unit | unit | ✅ OK |
| T9: NoopAuthGuard | NestJS unit (guard) | unit | unit | ✅ OK |
| T10: CognitoAuthGuard | NestJS unit (guard) | unit | unit | ✅ OK |
| T11: AuthModule | NestJS unit (module) | unit | unit | ✅ OK |
| T12: Wire AuthModule + health public | NestJS wiring + existing unit | unit | unit | ✅ OK |
| T13: Pin AUTH_PROVIDER=NONE in e2e | e2e | e2e | e2e | ✅ OK |
| T14: New auth e2e spec | e2e | e2e | e2e | ✅ OK |
| T15: ROADMAP.md | documentation | none | none | ✅ OK |
| T16: STATE.md | documentation | none | none | ✅ OK |

No violations — every task's `Tests` field matches the Test Coverage Matrix for the layer it touches.
