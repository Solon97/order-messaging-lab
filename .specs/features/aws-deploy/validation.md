# AWS Deploy (Fase 0) Validation

**Date**: 2026-07-15
**Spec**: `.specs/features/aws-deploy/spec.md`
**Diff range**: `af432ce..HEAD` (T3 scaffold onward; T1/T2 spot-checked, previously verified)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 (health endpoint) | ✅ Done | Code + tests present, `Done when` boxes checked in tasks.md, matches spec-defined outcomes exactly |
| T2 (Dockerfile) | ✅ Done | Multi-stage build present, `docker build`/`docker run` smoke steps described and consistent with `package.json` scripts |
| T3 (CDK scaffold) | ✅ Done (code) / ❌ tasks.md not updated | `infra/` scaffold, `config.ts` `ServiceConfig` match `design.md` exactly. **All 4 `Done when` checkboxes for T3 are unchecked (`- [ ]`) in `tasks.md` despite the deliverable being present and passing.** |
| T4 (FoundationStack) | ✅ Done (code) / ❌ tasks.md not updated | Stack + `infra/test/foundation-stack.test.ts` present and passing. Both `Done when` boxes unchecked in `tasks.md`. |
| T5 (NetworkStack) | ✅ Done (code) / ❌ tasks.md not updated | Both `Done when` boxes unchecked in `tasks.md`. |
| T6 (DatabaseStack) | ✅ Done (code) / ❌ tasks.md not updated | Both `Done when` boxes unchecked in `tasks.md`. |
| T7 (ComputeStack) | ✅ Done (code) / ❌ tasks.md not updated | Both `Done when` boxes unchecked in `tasks.md`. |
| T8 (EdgeStack) | ✅ Done (code) / ❌ tasks.md not updated | Both `Done when` boxes unchecked in `tasks.md`. |
| T9 (wiring) | ✅ Done | All 3 boxes checked; independently confirmed against `infra/cdk.out/manifest.json` (see Discrimination Sensor/SPEC_DEVIATION verification below). |
| T10 (deploy.yml) | ✅ Done | All boxes checked; workflow YAML parses, OIDC-only, `needs` gating present. |
| T11 (runbook) | ⚠️ Partial | Boxes checked, but the migration command in `infra/README.md` §3 does not correspond to any real file/script in the repo — see Gap 1 below. |

**Note on tracking hygiene**: The orchestrator's summary described "all 11 tasks... checked off," but `tasks.md` itself shows T3–T8's `Done when` checkboxes still unchecked even though the underlying code, tests, and commits for those tasks are real and passing. This is a documentation/bookkeeping gap, not a functional defect — flagged for correction and as a lesson (see below).

---

## Spec-Anchored Acceptance Criteria

### P1: Deploy do serviço `order` acessível publicamente

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1.1: `cdk deploy --all` provisions VPC/RDS/ECS/Fargate/ALB/API GW in reference dependency order | Stacks exist with correct dependency graph: Foundation/Network (root) → Database(Network) → Compute(Foundation+Network+Database+Edge) → Edge(Network) | `infra/bin/app.ts:11-39`; independently confirmed via `infra/cdk.out/manifest.json` (`ComputeStack -> [FoundationStack, NetworkStack, DatabaseStack, EdgeStack]`, `EdgeStack -> [NetworkStack]`, `DatabaseStack -> [NetworkStack]`); `cd infra && npx cdk synth` exits 0, `npx cdk list` returns `FoundationStack, NetworkStack, DatabaseStack, ComputeStack, EdgeStack` | ✅ PASS |
| AC1.2/1.3: `POST /orders` / `GET /orders/:id` via API Gateway → 201/200, persisted in RDS | Real HTTP round trip against deployed infra | No evidence possible without a live AWS account/region — spec's own "Independent Test" explicitly defers this to manual verification post-deploy. Design.md flags this as "primeiro deploy real fica marcado como validação manual." | ⚠️ Spec-precision gap (untestable pre-deploy, by design — not a code defect) |
| AC1.4: task definition reads `DATABASE_URL` from Secrets Manager, not plaintext env | `Secrets` array contains `DATABASE_URL`; `Environment` array does not | `infra/lib/compute-stack.ts:83-85` (`secrets: { DATABASE_URL: ecs.Secret.fromSecretsManager(...) }`); `infra/test/compute-stack.test.ts:24-45` asserts `Secrets` contains `DATABASE_URL` AND `Environment` does not contain it | ✅ PASS |
| AC1.5: migrations not yet applied → explicit failure, no `synchronize: true` fallback | `synchronize: false` always; no runtime provider switch | `src/order/infrastructure/persistence/typeorm/data-source.ts:11` (`synchronize: false`, no conditional); confirmed unchanged by this feature (AD-003 pre-existing) | ✅ PASS |

### P2: Pipeline de CI/CD sem credenciais estáticas

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC2.1: push to `main` → OIDC role assumed, build+push, tag written to SSM, no access keys | `role-to-assume` via OIDC, no `aws-access-key-id`, tag = SHA, `aws ssm put-parameter` | `.github/workflows/deploy.yml:45-49` (`configure-aws-credentials` with `role-to-assume: vars.ECR_PUSH_ROLE_ARN`, no static keys anywhere in file — confirmed via full read); `:53` (`value=${{ github.sha }}`); `:63-68` (`aws ssm put-parameter --name $IMAGE_TAG_PARAMETER --value $IMAGE_TAG`) | ✅ PASS |
| AC2.2: tag change → second job assumes deploy role via OIDC, runs `cdk deploy` | `needs: build-and-push`, separate `role-to-assume`, `cdk deploy --all` | `.github/workflows/deploy.yml:70-106` (`deploy` job, `needs: build-and-push`, `role-to-assume: vars.CDK_DEPLOY_ROLE_ARN`, `npx cdk deploy --all --require-approval never`) | ✅ PASS |
| AC2.3: failed health check on new task → automatic ECS rollback | `circuitBreaker: { enable: true, rollback: true }` | `infra/lib/compute-stack.ts:119`; `infra/test/compute-stack.test.ts:47-53` asserts `DeploymentCircuitBreaker: { Enable: true, Rollback: true }` | ✅ PASS |

**Status**: 6/8 criteria PASS with direct evidence; 1 flagged as an unavoidable spec-precision/pre-deploy gap (not a code defect — the spec itself scopes it to manual post-deploy verification); AC1.1 additionally required cross-referencing the raw CDK manifest (not just the design doc's prose) to confirm the documented SPEC_DEVIATION is real and not just asserted.

---

## SPEC_DEVIATION Verification (independent re-derivation)

Both `design.md` SPEC_DEVIATION notes were independently re-verified against the actual synthesized output, not just read as prose claims:

1. **T8 — `ApplicationTargetGroup` moved from `ComputeStack` to `EdgeStack`**: confirmed in `infra/lib/edge-stack.ts:94-105` (`registerFargateServiceListener` calls `this.listener.addTargets(...)` inside `EdgeStack`) and `infra/lib/compute-stack.ts:122-136` (`ComputeStack` exposes `listenerConfig`, not a target group). Matches the documented rationale.
2. **T9 — `ComputeStack` depends on `EdgeStack`, not the reverse**: confirmed via `infra/cdk.out/manifest.json` (generated fresh by this Verifier via `cdk synth`, not reused from a prior run): `"ComputeStack": ["FoundationStack", "NetworkStack", "DatabaseStack", "EdgeStack", ...]`, `"EdgeStack": ["NetworkStack", ...]` — no cycle, direction exactly as documented.

Both deviations are real, correctly documented, and do not compromise any acceptance criterion.

---

## Discrimination Sensor

Performed in the real working tree with mutations applied and reverted via `git checkout` (working tree was clean before and after — confirmed via `git status --short infra/` returning empty both times). All 3 mutations targeted the highest-risk, spec-precision-bearing properties in the new infra code.

| # | File:line | Description | Killed? |
| - | --------- | ------------ | ------- |
| 1 | `infra/lib/compute-stack.ts:80-87` | Moved `DATABASE_URL` from `secrets` to plaintext `environment`, emptied `secrets` | ✅ Killed — `compute-stack.test.ts` "injects DATABASE_URL via secrets" failed (`Secrets: undefined`) |
| 2 | `infra/lib/edge-stack.ts:34` | `internetFacing: false` → `true` (would re-open the reference's known internet-facing-ALB gap) | ✅ Killed — `edge-stack.test.ts` "creates the ALB as internal" failed (`Scheme: internet-facing`) |
| 3 | `infra/lib/foundation-stack.ts:24` | `ImageTagMutability: IMMUTABLE` → `MUTABLE` | ✅ Killed — `foundation-stack.test.ts` "creates an ECR repository with immutable tags" failed |

**Sensor depth**: lightweight (default tier — infra/lab context, not P0 payment/auth path)
**Result**: 3/3 killed — PASS ✅

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — 5 stacks map 1:1 to design.md, no speculative abstraction (explicitly rejected the reference's 6-stack "N services" genericity) |
| Surgical changes | ✅ — diff scope (`af432ce..HEAD`) touches only `infra/`, `.github/workflows/deploy.yml`, docs; no app-code changes outside T1's scope |
| No scope creep | ✅ — matches Out of Scope table in spec.md (no WAF, no multi-env, no ACM/Route53) |
| Matches patterns | ✅ — CDK `Template.fromStack` assertion style consistent across all 5 test files |
| Spec-anchored outcome check | ✅ — all infra-test assertions target the exact spec-defined property values (`IMMUTABLE`, `internal`, `Secrets` not `Environment`, `/health`, `Enable: true, Rollback: true`), not just presence checks |
| Per-layer coverage expectation met | ✅ — every CDK stack has a corresponding `Template.fromStack` unit test file; `HealthController` has both unit (3 branches) and e2e coverage per the Test Coverage Matrix |
| Every test maps to a spec/AC/Done-when criterion | ✅ — cross-checked each `infra/test/*.test.ts` assertion against the Test Coverage Matrix and each task's `Done when` list; no unclaimed tests found |
| Documented guidelines followed | "none — strong defaults applied" (tasks.md itself notes no `AGENTS.md`/`CLAUDE.md`/`CONTRIBUTING.md` testing guideline found) |

---

## Edge Cases

- [x] RDS unavailable → `/health` fails (`SELECT 1` throws) → 503 → target group marks unhealthy: `src/shared/http/health.controller.ts:22-28`, `infra/lib/edge-stack.ts:102` (`healthCheck: { path: config.healthCheckPath }`)
- [x] `PERSISTENCE_PROVIDER` unset → defaults to `POSTGRES` (AD-009): `infra/lib/compute-stack.ts` task definition never sets `PERSISTENCE_PROVIDER`, relies on app default — confirmed no such env var anywhere in `compute-stack.ts`
- [x] Unmapped route → ALB 404 via default action: `infra/lib/edge-stack.ts:40-44` (`fixedResponse(404, ...)`), asserted in `edge-stack.test.ts:35-44`
- [x] Migrations not applied → `/orders` returns 500 from CloudWatch-visible logs, no special handling: consistent with unchanged `OrderExceptionFilter` (out of this feature's diff) and `awslogs` driver configured in `compute-stack.ts:72-79`

---

## Gate Check

- **Gate command (infra)**: `cd infra && npm test && npx cdk synth`
- **Result**: infra unit — 5 suites / 16 tests passed, 0 failed; `cdk synth` exits 0 with 1 non-blocking CDK annotation (`minHealthyPercent` default-value warning, unrelated to this feature's ACs)
- **Gate command (repo root)**: `npm test && npm run test:e2e`
- **Result**: root unit — 10 suites / 44 tests passed; e2e — 3 suites / 16 tests passed. Combined with infra: 76 tests total.
- **Test count before feature**: 54 (per spec.md problem statement, Fase 0 baseline)
- **Test count after feature**: 76 (44 root unit + 16 root e2e + 16 infra unit)
- **Delta**: +22 (T1 added 3 unit + 1 e2e; T4-T8 added 16 infra unit tests; some baseline recount differences are expected since spec.md's "54" predates infra tests existing at all)
- **Skipped tests**: none observed
- **Failures**: none in the clean tree (mutation failures were injected/reverted deliberately — see Discrimination Sensor)
- **Lint**: skipped per instruction — repo-root `npm run lint` fails on a pre-existing `.dependency-cruiser.js` ESLint config issue, independently confirmed pre-existing on `main` in a prior session (`git stash` test); not caused by this feature and out of its diff scope.

---

## Fix Plans

### Gap 1 (Minor): Migration command in `infra/README.md` §3 does not match the actual codebase

- **Root cause**: The runbook's `aws ecs run-task` override command is:
  ```
  node dist/node_modules/.bin/typeorm-ts-node-esm migration:run -d dist/typeorm.config.js
  ```
  Neither path exists. There is no `dist/node_modules/` (npm installs node_modules at the project root, not nested under the compiled `dist/` output), and there is no `typeorm.config.ts`/`.js` anywhere in the repo — the actual TypeORM `DataSource` lives at `src/order/infrastructure/persistence/typeorm/data-source.ts`, which compiles to `dist/order/infrastructure/persistence/typeorm/data-source.js`. `design.md`'s own Migration runbook section describes a different (also non-existent) command: `npm run typeorm -- migration:run -d dist/order/infrastructure/persistence/typeorm/data-source.js` — there is no `typeorm` script in `package.json`'s `scripts` block either. T11's `Done when` explicitly requires "each command is copy-pasteable (real CLI syntax, not pseudocode)" — this criterion is not met for the migration command specifically.
- **Fix task**: Add a `typeorm` script to root `package.json` (e.g. `"typeorm": "typeorm-ts-node-commonjs"` or, for the compiled-JS runtime path used in production, invoke the TypeORM CLI directly against the compiled data source: `node ./node_modules/typeorm/cli.js migration:run -d dist/order/infrastructure/persistence/typeorm/data-source.js`). Update `infra/README.md` §3's `--overrides` command to reference the corrected, verified-working invocation and the real compiled path.
- **Priority**: Minor (does not block the automated deploy pipeline or any tested code path; would only surface as a broken command when an operator actually tries to run the first migration — a real but narrowly-scoped operational risk)

### Gap 2 (Minor): `tasks.md` `Done when` checkboxes for T3–T8 are unchecked despite completed, tested, committed work

- **Root cause**: bookkeeping — the checkboxes for T3, T4, T5, T6, T7, T8 were never checked off during Execute, even though `e745855` ("update tasks with completion checkboxes") only checked T1, T2, T9, T10, T11.
- **Fix task**: Check the remaining boxes in `.specs/features/aws-deploy/tasks.md` (lines 142-145, 169-170, 194-195, 219-220, 244-245, 269-270) now that this Verifier has independently confirmed each task's deliverable is real, tested, and passing.
- **Priority**: Cosmetic (traceability hygiene only — no functional impact, but leaves the task file inconsistent with reality, which risks future confusion about what's actually done)

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| AWSD-01 | In Tasks | ✅ Verified (infra-provisioning ACs; live-traffic AC deferred to manual post-deploy per spec design) |
| AWSD-02 | In Tasks | ✅ Verified |
| AWSD-03 | In Tasks | ✅ Verified |
| AWSD-04 | In Tasks | ✅ Verified |
| AWSD-05 | In Tasks | ⚠️ Needs Fix (migration runbook command, Gap 1) |
| AWSD-06 | In Tasks | ✅ Verified |
| AWSD-07 | In Tasks | ✅ Verified |
| AWSD-08 | In Tasks | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Issues (2 minor gaps, neither blocking; both narrowly scoped and easy to fix)

**Spec-anchored check**: 6/8 ACs directly matched to spec-defined outcomes with file:line evidence; 1 correctly flagged as an unavoidable pre-deploy spec-precision gap (by the spec's own design, not a defect)
**Sensor**: 3/3 mutations killed
**Gate**: infra 16/16 passed, `cdk synth` clean; repo root 60/60 passed (44 unit + 16 e2e)

**What works**: All 5 CDK stacks provision the exact resources/properties the spec and design require, with tests that discriminate real regressions (verified via mutation testing, not just presence-of-assertion). Both documented SPEC_DEVIATION notes (target group ownership, cross-stack dependency direction) are accurate re-derivations of the real `cdk synth` output, not just asserted claims. CI/CD pipeline is fully OIDC-based with no static credentials anywhere in the workflow. `/health` endpoint correctly branches on DB presence/failure per spec Edge Cases.

**Issues found**:
1. Migration runbook command references non-existent files/scripts — fix per Gap 1 above.
2. `tasks.md` completion checkboxes for T3–T8 are stale/unchecked — fix per Gap 2 above.

**Next steps**: Apply Gap 1 (add correct `typeorm` invocation, verify it against a real `dist/` build) and Gap 2 (check the boxes) as small follow-up edits. Neither blocks moving to the next feature; recommend fixing before the first real `cdk deploy --all` is attempted, since Gap 1 would otherwise surface as a runtime failure during the manual migration step.
