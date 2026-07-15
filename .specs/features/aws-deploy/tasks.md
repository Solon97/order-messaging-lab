# AWS Deploy (Fase 0) Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/aws-deploy/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase sampling (`src/order/infrastructure/http/order-exception.filter.spec.ts`, `test/orders.e2e-spec.ts`, root `package.json` jest config, `test/jest-e2e.json`) and spec/design. No `AGENTS.md`/`CLAUDE.md`/`CONTRIBUTING.md` testing guidelines found in the repo — strong defaults applied, adapted to what's mechanically testable for IaC/CI code (CDK stacks are tested via synth-time resource assertions, not runtime; Dockerfile/workflow YAML have no test framework in this repo, so their gate is a successful build/synth, not unit tests).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------- | --------------------- | ----------------- | ----------- |
| `HealthController` (NestJS controller, `src/shared/`) | unit + e2e | Happy path (DB reachable → 200), DB failure path (→ 503), no-DataSource path (`IN_MEMORY` mode → 200, per design decision in T1) | `src/shared/http/health.controller.spec.ts`, `test/health.e2e-spec.ts` | `npm test`, `npm run test:e2e` |
| CDK Stacks (`FoundationStack`, `NetworkStack`, `DatabaseStack`, `ComputeStack`, `EdgeStack`) | unit (CDK `assertions.Template`) | Each stack's key resources exist with the design's non-obvious properties (e.g. `IMMUTABLE` ECR, `internal: true` ALB, `secrets` not `environment` for `DATABASE_URL`, RDS SG scoped to Fargate SG only, health check path `/health`) — not full snapshot testing | `infra/test/*.test.ts` (one file per stack) | `cd infra && npm test` |
| `infra/bin/app.ts` (stack wiring) | none | Build/synth gate only — correctness is "does it synthesize with the right stack dependency order" | `infra/bin/app.ts` | `cd infra && npx cdk synth` |
| `Dockerfile` | none | Build gate only — image builds and starts | root `Dockerfile` | `docker build -t order-service .` |
| `.github/workflows/deploy.yml` | none | No YAML test tooling in this repo (no `actionlint` installed) — structural review only, validated for real at first pipeline run | `.github/workflows/deploy.yml` | manual review (no command) |
| Migration runbook (docs) | none | Review only | `infra/README.md` | manual review (no command) |

## Gate Check Commands

> Generated from `package.json` scripts, `test/jest-e2e.json`, and `.github/workflows/ci.yml` (existing gate for app code). Infra commands are new (no `infra/package.json` exists yet — created in T3).

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick (app) | After a task that only touches app unit-testable code | `npm test` |
| Full (app) | After a task that touches app code reachable from an HTTP route | `npm test && npm run test:e2e` |
| Infra-unit | After a task that adds/changes one CDK stack | `cd infra && npm test` |
| Infra-synth | After a task that wires multiple stacks together | `cd infra && npx cdk synth` |
| Build (full CI parity) | After phase completion | `npm run build && npm run lint && npm run lint:arch && npm test && npm run test:e2e` |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Health check endpoint (app)

```
T1
```

### Phase 2: Containerization

```
T2
```

### Phase 3: CDK infrastructure

```
T3 → T4 → T5 → T6 → T7 → T8 → T9
```

### Phase 4: CI/CD pipeline and runbook

```
T10 → T11
```

---

## Task Breakdown

### T1: Add `/health` endpoint

**What**: New `HealthController` at `GET /health`, checking Postgres reachability via TypeORM `DataSource` when one is registered; returns `200` without a DB check when no `DataSource` is available (i.e. `PERSISTENCE_PROVIDER=IN_MEMORY`, where `OrdersModule` never imports `TypeOrmModule` — confirmed in `src/order/order.module.ts:15-23`). This mirrors the AWS deploy default (`POSTGRES`, AD-009) where a `DataSource` always exists, while keeping local/e2e `IN_MEMORY` runs working without a DI resolution error.
**Where**: `src/shared/http/health.controller.ts`, `src/shared/http/health.module.ts` (registered in `src/app.module.ts`)
**Depends on**: None
**Reuses**: `@InjectDataSource()` pattern already available via `@nestjs/typeorm` (already a dependency); `OrderExceptionFilter`'s existing test style (`src/order/infrastructure/http/order-exception.filter.spec.ts`) as the unit-test structure to follow
**Requirement**: Design gap identified in `design.md` → `Risks & Concerns` (supports AWSD-01, AWSD-08 — ALB target group needs a health check path)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `GET /health` returns `200 { status: 'ok' }` when the injected `DataSource` runs `SELECT 1` successfully
- [x] `GET /health` returns `503` when the `DataSource` query throws
- [x] `GET /health` returns `200 { status: 'ok' }` when no `DataSource` is bound (use `@Optional()` injection) — covers `PERSISTENCE_PROVIDER=IN_MEMORY`
- [x] Gate check passes: `npm test && npm run test:e2e`
- [x] Test count: unit tests for all 3 branches above + 1 e2e test hitting `/health` on the `IN_MEMORY`-configured app (same bootstrap pattern as `test/orders.e2e-spec.ts`)

**Tests**: unit + e2e
**Gate**: full

**Commit**: `feat(health): add /health endpoint for ALB target group checks`

---

### T2: Add `Dockerfile` and `.dockerignore`

**What**: Multi-stage `Dockerfile` (build stage: `npm ci` + `npm run build`; runtime stage: `npm ci --omit=dev` + `dist/`), `CMD ["node", "dist/main"]`, exposing the port read from `PORT` (default `3000`, matching `src/main.ts:18`). `.dockerignore` excludes `node_modules`, `dist`, `coverage`, `.git`, `infra/`.
**Where**: `Dockerfile`, `.dockerignore` (repo root)
**Depends on**: None
**Reuses**: existing `build`/`start:prod` scripts in `package.json`

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `docker build -t order-service .` succeeds
- [x] `docker run --rm -e PERSISTENCE_PROVIDER=IN_MEMORY -p 3000:3000 order-service` starts and `curl localhost:3000/health` (from T1) returns `200`
- [x] Final image does not contain `devDependencies` (verify via `docker run --rm order-service ls node_modules | grep -c jest` returning nothing, or equivalent spot check)

**Tests**: none (build gate only, per Test Coverage Matrix)
**Gate**: `docker build -t order-service .` + manual `docker run` smoke check above

**Commit**: `feat(deploy): add production Dockerfile`

---

### T3: Scaffold the `infra/` CDK project via `cdk init`

**What**: `mkdir infra && cd infra && npx cdk init app --language typescript` — standard CDK scaffolding tool, not hand-authored config, so `package.json`, `cdk.json`, `tsconfig.json`, jest config, `.gitignore` and the default `bin/`/`lib/`/`test/` layout all follow the toolchain's own convention. After init: (1) remove the generated sample stack/test (`lib/infra-stack.ts`, `test/infra.test.ts`) — real stacks are added in T4-T8; (2) rename the generated entry point to `bin/app.ts` if `cdk init` named it `bin/infra.ts` (matching `design.md`'s file reference — `cdk.json`'s `app` command must be updated to match); (3) add `infra/lib/config.ts` implementing the `ServiceConfig` interface from `design.md` (`serviceName: 'order-service'`, `containerPort: 3000`, `publicPath: '/orders'`, `healthCheckPath: '/health'`, `cpu: 512`, `memoryLimitMiB: 1024`, `desiredCount: 1`).
**Where**: `infra/` (new directory, `cdk init`-generated + the adjustments above)
**Depends on**: None
**Reuses**: `cdk init app --language typescript` — the CDK CLI's own project template (not `aws-reference.md`, which doesn't cover scaffolding); CDK dependencies stay isolated from the NestJS app's `package.json`, since `cdk init` generates its own `infra/package.json`

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `npx cdk init app --language typescript` ran successfully inside an empty `infra/` directory
- [ ] Generated sample stack and its test are removed (no leftover `lib/infra-stack.ts` / `test/infra.test.ts` referencing a placeholder resource)
- [ ] `cd infra && npm install && npx cdk synth` succeeds against an app with zero real stacks (sanity check of the generated toolchain before adding stacks)
- [ ] `ServiceConfig` values in `infra/lib/config.ts` match `design.md` → `Data Models` exactly

**Tests**: none (config/scaffold layer, per Test Coverage Matrix)
**Gate**: Infra-synth (`cd infra && npx cdk synth`)

**Commit**: `chore(infra): scaffold CDK app`

---

### T4: `FoundationStack` (ECR + OIDC)

**What**: CDK stack provisioning the ECR repository (`order-service`, `imageTagMutability: IMMUTABLE`, `emptyOnDelete: true`, `removalPolicy: DESTROY`), the SSM Parameter `/order-messaging-lab/order-service/image-tag`, the GitHub OIDC push role (`github-actions-order-service-ecr-push`, `sub` restricted to this repo's `main` branch, `grantPullPush` on the repo, `grantWrite` on the SSM parameter), and the CDK-deploy role (`github-actions-cdk-deploy`, restricted to `sts:AssumeRole` on the 4 CDK bootstrap roles only).
**Where**: `infra/lib/foundation-stack.ts`, `infra/test/foundation-stack.test.ts`
**Depends on**: T3
**Reuses**: role/permission shape described in `aws-reference.md` §1, adapted per `design.md` → `FoundationStack` component (exposes `repository` and `imageTagParameter` as public readonly props for cross-stack reference)
**Requirement**: AWSD-06, AWSD-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `Template.fromStack` assertions confirm: ECR repo has `ImageTagMutability: IMMUTABLE`; SSM parameter exists at the expected name; push role's trust policy `StringLike` condition references this repo + `main` branch; deploy role has no direct resource permissions beyond `sts:AssumeRole`
- [ ] Gate check passes: `cd infra && npm test`

**Tests**: unit (CDK assertions)
**Gate**: Infra-unit

**Commit**: `feat(infra): add FoundationStack (ECR + OIDC)`

---

### T5: `NetworkStack` (VPC)

**What**: CDK stack provisioning a single VPC, `maxAzs: 2`, default subnet configuration (NAT Gateway kept per spec Assumption — no cost optimization in v1).
**Where**: `infra/lib/network-stack.ts`, `infra/test/network-stack.test.ts`
**Depends on**: T3
**Reuses**: `aws-reference.md` §2 network shape, per `design.md` → `NetworkStack` component (exposes `vpc` as public readonly prop)
**Requirement**: AWSD-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `Template.fromStack` assertions confirm exactly 1 VPC resource with 2 AZs' worth of subnets (public + private)
- [ ] Gate check passes: `cd infra && npm test`

**Tests**: unit (CDK assertions)
**Gate**: Infra-unit

**Commit**: `feat(infra): add NetworkStack (VPC)`

---

### T6: `DatabaseStack` (RDS Postgres)

**What**: CDK stack provisioning the RDS Postgres instance (`db.t4g.micro`, private subnets of the VPC from `NetworkStack`) and its dedicated security group, with ingress locked down (no rule opened yet — the Fargate SG's ingress rule is added by `ComputeStack` in T7, per `design.md`'s cross-stack security group reference).
**Where**: `infra/lib/database-stack.ts`, `infra/test/database-stack.test.ts`
**Depends on**: T5 (receives `vpc` via props)
**Reuses**: none from `aws-reference.md` (RDS is not part of that reference pattern — new to this project, per spec/context)
**Requirement**: AWSD-01, AWSD-02, AWSD-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `Template.fromStack` assertions confirm: 1 `AWS::RDS::DBInstance` with engine `postgres`, instance class `db.t4g.micro`, in private subnets; 1 dedicated security group with no open ingress rules at this point (verified via absence of a `0.0.0.0/0` or wide-CIDR ingress rule)
- [ ] Gate check passes: `cd infra && npm test`

**Tests**: unit (CDK assertions)
**Gate**: Infra-unit

**Commit**: `feat(infra): add DatabaseStack (RDS Postgres)`

---

### T7: `ComputeStack` (ECS Cluster + Fargate Service)

**What**: CDK stack provisioning the ECS Cluster (`containerInsightsV2: ENABLED`), the Fargate task definition (`cpu`/`memoryLimitMiB` from `ServiceConfig`, container image from `FoundationStack`'s ECR repo + SSM tag, `awslogs` driver, `PORT` env var), the Secrets Manager secret holding `DATABASE_URL` (built from the RDS endpoint + generated credentials) injected via the task definition's `secrets` (not `environment`), the Fargate service (`circuitBreaker: { enable: true, rollback: true }`, `desiredCount` from config, security group restricted to the VPC CIDR), the ingress rule on `DatabaseStack`'s database security group allowing only this service's security group, and the `ApplicationTargetGroup` with health check path `/health` (T1) — not yet attached to a listener (done in `EdgeStack`, T8).
**Where**: `infra/lib/compute-stack.ts`, `infra/test/compute-stack.test.ts`
**Depends on**: T4, T5, T6
**Reuses**: `aws-reference.md` §4 task/service shape; `ServiceConfig` from T3
**Requirement**: AWSD-01, AWSD-04, AWSD-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `Template.fromStack` assertions confirm: task definition's container has a `Secrets` entry named `DATABASE_URL` (not present in `Environment`); `DeploymentConfiguration`/`DeploymentCircuitBreaker` has `Enable: true, Rollback: true`; target group health check path is `/health`; database security group (from `DatabaseStack`'s template, cross-stack) receives an ingress rule scoped to the Fargate service's security group only
- [ ] Gate check passes: `cd infra && npm test`

**Tests**: unit (CDK assertions)
**Gate**: Infra-unit

**Commit**: `feat(infra): add ComputeStack (ECS cluster + Fargate service)`

---

### T8: `EdgeStack` (ALB + API Gateway + VPC Link)

**What**: CDK stack provisioning the internal Application Load Balancer (`internal: true` explicit — closing the reference's known gap), HTTP:80 listener with default `404` fixed response, registration of `ComputeStack`'s target group with a path-pattern rule for `/orders*`, the VPC Link security group (egress restricted to the ALB's SG on the listener port only), the HTTP API (API Gateway v2), and the `HttpAlbIntegration` route rewriting the public path (`/orders`) to the internal path.
**Where**: `infra/lib/edge-stack.ts`, `infra/test/edge-stack.test.ts`
**Depends on**: T5, T7
**Reuses**: `aws-reference.md` §5–6 shape; `ServiceConfig.publicPath` from T3
**Requirement**: AWSD-01, AWSD-02, AWSD-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `Template.fromStack` assertions confirm: ALB has `Scheme: internal`; listener default action is a fixed `404` response; HTTP API exists with a route matching the public `/orders` path; VPC Link security group has no unrestricted egress rule
- [ ] Gate check passes: `cd infra && npm test`

**Tests**: unit (CDK assertions)
**Gate**: Infra-unit

**Commit**: `feat(infra): add EdgeStack (ALB + API Gateway + VPC Link)`

---

### T9: Wire all stacks in `infra/bin/app.ts`

**What**: Instantiate `FoundationStack`, `NetworkStack`, `DatabaseStack`, `ComputeStack`, `EdgeStack` in `infra/bin/app.ts` in dependency order (per `design.md`'s stack table), passing cross-stack props (`vpc`, `repository`, `imageTagParameter`, `database`, `databaseSecurityGroup`, `targetGroup`), with explicit `addDependency` calls matching the dependency table so `cdk deploy --all` respects ordering even without prop-based implicit dependencies.
**Where**: `infra/bin/app.ts` (modify from T3's skeleton)
**Depends on**: T4, T5, T6, T7, T8
**Reuses**: nothing new — pure wiring of prior tasks' outputs
**Requirement**: AWSD-01, AWSD-02, AWSD-03 (this task is what makes `cdk deploy --all` produce a working, publicly reachable stack — validated manually per the spec's Independent Test, since it requires a real AWS account)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `cd infra && npx cdk synth` succeeds with all 5 stacks present and zero synth errors
- [x] `cd infra && npx cdk list` shows the 5 stacks in the order matching `design.md`'s dependency table
- [x] Manually inspect `cdk synth`'s stack dependency graph (`infra/cdk.out/manifest.json`) to confirm `ComputeStack` depends on `FoundationStack`+`NetworkStack`+`DatabaseStack`+`EdgeStack`, and `EdgeStack` depends on `NetworkStack` only — SPEC_DEVIATION (see `design.md` → `EdgeStack`): `ComputeStack` depends on `EdgeStack`, not the reverse as originally planned, because the ECS Service's automatic safety dependency onto its target group's listener rule lives on the `ComputeStack`-owned `Service` resource; the reverse direction would create a genuine CDK stack-dependency cycle (see T8's SPEC_DEVIATION)

**Tests**: none (wiring/integration of already-unit-tested stacks; correctness is synth-time, per Test Coverage Matrix)
**Gate**: Infra-synth

**Commit**: `feat(infra): wire CDK stacks in dependency order`

---

### T10: GitHub Actions deploy workflow

**What**: New `.github/workflows/deploy.yml`, triggered `on: push: branches: [main]`, with `needs`-gated jobs: (1) `build-and-push` — reuses the `npm ci`/lint/test steps from `ci.yml` as a gate, assumes the push role via OIDC (`aws-actions/configure-aws-credentials`), `docker build`, pushes to ECR with tag = commit SHA, writes the tag to the SSM parameter (`aws ssm put-parameter`); (2) `deploy` (`needs: build-and-push`) — assumes the CDK-deploy role via OIDC, runs `cd infra && npm ci && npx cdk deploy --all --require-approval never`.
**Where**: `.github/workflows/deploy.yml`
**Depends on**: T2, T9
**Reuses**: `npm ci`/build/lint/test steps already in `.github/workflows/ci.yml`
**Requirement**: AWSD-06, AWSD-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Workflow YAML is structurally valid (`yamllint .github/workflows/deploy.yml` if available locally, else visually verified against `ci.yml`'s syntax as a baseline)
- [ ] Both jobs use `permissions: id-token: write` (required for OIDC) and no static AWS credentials appear anywhere in the file
- [ ] `deploy` job has `needs: build-and-push`
- [ ] Role ARNs are read from repo variables/secrets (e.g. `${{ vars.ECR_PUSH_ROLE_ARN }}`, `${{ vars.CDK_DEPLOY_ROLE_ARN }}`), not hardcoded — documented in T11's runbook as a manual one-time setup step after the first `cdk deploy --all`

**Tests**: none (no YAML test tooling in repo, per Test Coverage Matrix)
**Gate**: manual review only

**Commit**: `feat(deploy): add GitHub Actions OIDC deploy pipeline`

---

### T11: Deploy runbook documentation

**What**: `infra/README.md` documenting: (1) prerequisites (`cdk bootstrap`, existing GitHub OIDC provider); (2) the manual first `cdk deploy --all` (bootstraps the OIDC roles the workflow later depends on — the circular-dependency risk flagged in `design.md` → `Risks & Concerns`); (3) the one-off migration step (`aws ecs run-task` overriding the container command to run `typeorm migration:run` against the RDS instance, before the first request hits `/orders`); (4) how to configure `deploy.yml`'s repo variables with the role ARNs output by `FoundationStack`.
**Where**: `infra/README.md`
**Depends on**: T9
**Reuses**: none

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] All 4 sections above are present and each command is copy-pasteable (real CLI syntax, not pseudocode)
- [ ] The migration `ecs run-task` command references the exact task definition family name and override command matching `ComputeStack`'s (T7) actual container/task definition naming

**Tests**: none (docs, per Test Coverage Matrix)
**Gate**: manual review only

**Commit**: `docs(infra): add deploy and migration runbook`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1
Phase 2:  T2
Phase 3:  T3 ──→ T4 ──→ T5 ──→ T6 ──→ T7 ──→ T8 ──→ T9
Phase 4:  T10 ──→ T11
```

Execution is strictly sequential — there is no intra-phase parallelism. A single agent (or batch worker) works one task at a time, in order.

**Total: 11 tasks.** This exceeds the ~8-task single-batch threshold — at Execute, the sub-agent delegation offer applies (see `tlc-spec-driven` Critical Rules). Natural packing given phase sizes (1, 1, 7, 2): Batch 1 = Phase 1 + Phase 2 + Phase 3 (9 tasks — one phase over the ~7 budget, but Phase 3 is a single tight dependency chain, `NetworkStack`→`DatabaseStack`→`ComputeStack`→`EdgeStack`→wiring, that cannot be split without breaking cross-stack references — a legitimate fat phase per the sub-agent packing rule), Batch 2 = Phase 4 (2 tasks). Final packing/offer decision happens at Execute time.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: `/health` endpoint | 1 controller + 1 module | ✅ Granular |
| T2: Dockerfile + `.dockerignore` | 2 tightly-coupled build config files | ✅ Granular (cohesive) |
| T3: Scaffold `infra/` | 1 project scaffold (config only, no logic) | ✅ Granular |
| T4: `FoundationStack` | 1 CDK stack | ✅ Granular |
| T5: `NetworkStack` | 1 CDK stack | ✅ Granular |
| T6: `DatabaseStack` | 1 CDK stack | ✅ Granular |
| T7: `ComputeStack` | 1 CDK stack | ✅ Granular |
| T8: `EdgeStack` | 1 CDK stack | ✅ Granular |
| T9: `bin/app.ts` wiring | 1 file, wiring only | ✅ Granular |
| T10: `deploy.yml` | 1 workflow file | ✅ Granular |
| T11: `infra/README.md` | 1 doc file | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ----------------------- | -------------- | ------ |
| T1 | None | No arrow (Phase 1 start) | ✅ Match |
| T2 | None | No arrow (Phase 2 start) | ✅ Match |
| T3 | None | No arrow (Phase 3 start) | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T3 | T3 → T4 → T5 (chained; T5 also directly needs only T3) | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T4, T5, T6 | T6 → T7 (chain includes T4, T5 transitively via the sequential phase order) | ✅ Match |
| T8 | T5, T7 | T7 → T8 (T5 satisfied earlier in the same chain) | ✅ Match |
| T9 | T4, T5, T6, T7, T8 | T8 → T9 (all prior stacks satisfied earlier in the same chain) | ⚠️ Task order matches (T9 wires all 5 stacks after T4-T8 exist), but the runtime CDK stack dependency between `ComputeStack` and `EdgeStack` is inverted vs. the original design — see SPEC_DEVIATION in `design.md` → `EdgeStack` and the `Done when` note above |
| T10 | T2, T9 | Phase 3 → Phase 4 (T9 → T10); T2 satisfied in Phase 2, earlier | ✅ Match |
| T11 | T9 | T10 → T11 (T9 satisfied earlier in Phase 3) | ✅ Match |

No task depends on a task in a later phase — all dependencies point backward or within the same phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | ---------------------------- | ---------------- | ---------- | ------ |
| T1: `/health` endpoint | `HealthController` | unit + e2e | unit + e2e | ✅ OK |
| T2: Dockerfile | Dockerfile | none (build gate) | none | ✅ OK |
| T3: Scaffold `infra/` | config/scaffold | none | none | ✅ OK |
| T4: `FoundationStack` | CDK stack | unit (CDK assertions) | unit | ✅ OK |
| T5: `NetworkStack` | CDK stack | unit (CDK assertions) | unit | ✅ OK |
| T6: `DatabaseStack` | CDK stack | unit (CDK assertions) | unit | ✅ OK |
| T7: `ComputeStack` | CDK stack | unit (CDK assertions) | unit | ✅ OK |
| T8: `EdgeStack` | CDK stack | unit (CDK assertions) | unit | ✅ OK |
| T9: `bin/app.ts` wiring | wiring (no new stack logic) | none (synth gate) | none | ✅ OK |
| T10: `deploy.yml` | GitHub Actions workflow | none (no YAML tooling in repo) | none | ✅ OK |
| T11: `infra/README.md` | docs | none | none | ✅ OK |

No violations — every task's `Tests` field matches its code layer's row in the Test Coverage Matrix.

---

## Tips

- **Phases are ordered** — Each phase completes before the next; tasks run in order within a phase
- **Reuses = Token saver** — Always reference existing code
- **Tools per task** — MCPs and Skills prevent wrong approaches
- **Dependencies are gates** — Clear what blocks what
- **Done when = Testable** — If you can't verify it, rewrite it
- **Requirement ID = Traceable** — Every task traces back to a spec requirement
- **One commit per task** — Plan the commit message format in advance
