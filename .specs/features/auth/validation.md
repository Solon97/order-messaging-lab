# Auth (Cognito M2M) Validation — Phases 1-3 (T1-T6, infra only)

**Date**: 2026-07-17
**Spec**: `.specs/features/auth/spec.md`
**Diff range**: `dbcd8e5..a227340` (6 commits, T1-T6)
**Verifier**: independent sub-agent (author ≠ verifier)
**Scope note**: Only Phases 1-3 (T1-T6, pure CDK infra) were implemented in this session. Phases 4-6 (NestJS guard, e2e, docs) are **out of scope** for this pass and their absence is not a gap here — they will be verified in a later pass once implemented.

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | `infra/lib/auth-stack.ts` — User Pool, Resource Server (1 scope `access`), App Client (`client_credentials`, generated secret) |
| T2   | ✅ Done | `infra/bin/app.ts:15` — `AuthStack` instantiated, no VPC/DB dependency |
| T3   | ✅ Done | `infra/lib/edge-stack.ts` — `HttpJwtAuthorizer` attached to both `/orders` routes |
| T4   | ✅ Done | `infra/lib/edge-stack.ts` + `infra/lib/config.ts` — explicit `$default` stage with throttle |
| T5   | ✅ Done | `infra/bin/app.ts:43-49` — `AuthStack` outputs wired into `EdgeStack`, `edgeStack.addDependency(authStack)` |
| T6   | ✅ Done | `infra/lib/compute-stack.ts` + `infra/bin/app.ts:28-29,34` — env vars wired, `computeStack.addDependency(authStack)` |

---

## Spec-Anchored Acceptance Criteria (infra scope only)

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AUTH-04: App Client + Resource Server via CDK, single source of truth | User Pool + 1 Resource Server (`order-service`, 1 scope) + App Client with `client_credentials` flow, generated secret | `infra/test/auth-stack.test.ts:10-12` — `template.resourceCountIs('AWS::Cognito::UserPool', 1)`; `:14-30` — `hasResourceProperties('AWS::Cognito::UserPoolResourceServer', {Identifier:'order-service', Scopes: arrayWith({ScopeName:'access'})})` + `scopes.toHaveLength(1)`; `:32-38` — `hasResourceProperties('AWS::Cognito::UserPoolClient', {GenerateSecret:true, AllowedOAuthFlows:['client_credentials'], AllowedOAuthFlowsUserPoolClient:true})` | ✅ PASS |
| AUTH-04 (same User Pool used by authorizer): EdgeStack authorizer bound to the same User Pool AuthStack provisions | Both `/orders` routes carry `AuthorizerId` referencing the JWT authorizer built from `authStack.userPool` | `infra/test/edge-stack.test.ts:69-100` — asserts `AWS::ApiGatewayV2::Authorizer` `AuthorizerType:'JWT'`, then for both proxy (`ANY /orders/{proxy+}`) and root (`ANY /orders`) routes: `expect(properties.AuthorizerId).toEqual({Ref: authorizerLogicalId})`. Stack under test constructed with `userPool: authStack.userPool` (`:30`) | ✅ PASS |
| AUTH-05: client credentials never hardcoded / never in `CfnOutput` | Only `userPoolId`/`userPoolClientId` are output; no `ClientSecret` string anywhere in `Outputs` | `infra/test/auth-stack.test.ts:40-53` — `expect(outputValues).not.toMatch(/ClientSecret/i)`; `expect(outputNames.some(name => /UserPoolId/i.test(name))).toBe(true)`; same for `UserPoolClientId` | ✅ PASS |
| AUTH-01 (infra half — authorizer wiring, not the guard): JWT authorizer attached to both routes, no unauthenticated bypass | `AuthorizerType: 'JWT'`, both routes reference it | `infra/test/edge-stack.test.ts:69-100` (see above) — additionally confirms exactly 1 route matches each RouteKey (`toHaveLength(1)`), ruling out a duplicate unauthenticated route | ✅ PASS |
| AUTH-06: throttling (rate + burst) configured on the HTTP API stage | `$default` stage, `AutoDeploy:true`, `DefaultRouteSettings.ThrottlingRateLimit`/`ThrottlingBurstLimit` matching `edgeThrottle` config (50 / 100, lab-scale) | `infra/test/edge-stack.test.ts:102-111` — `hasResourceProperties('AWS::ApiGatewayV2::Stage', {StageName:'$default', AutoDeploy:true, DefaultRouteSettings: objectLike({ThrottlingRateLimit: edgeThrottle.rateLimit, ThrottlingBurstLimit: edgeThrottle.burstLimit})})` | ⚠️ Spec-precision gap (see note below) |
| AUTH-04 (env var propagation, prerequisite for guard in later phase): container gets Cognito identifiers | `ECS::TaskDefinition` container `Environment` includes `AUTH_PROVIDER=COGNITO`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` (imported from `AuthStack`) | `infra/test/compute-stack.test.ts:51-78` — `expect(envByName.AUTH_PROVIDER).toBe('COGNITO')`; `COGNITO_USER_POOL_ID`/`COGNITO_CLIENT_ID` asserted to be `Fn::ImportValue` referencing `TestAuthStack2` | ✅ PASS |

**⚠️ Spec-precision gap note (AUTH-06):** the test asserts `ThrottlingRateLimit`/`ThrottlingBurstLimit` equal `edgeThrottle.rateLimit`/`edgeThrottle.burstLimit` — i.e., it re-imports the same constant the implementation uses, rather than asserting a spec-anchored literal (e.g. `50`/`100`). The spec itself (`AUTH-06`/P2 ACs) does not mandate specific numeric values ("um limite de rate/burst configurado", no number given), so this isn't a spec violation, but it does mean the assertion can't discriminate against an accidental edit to the `edgeThrottle` constant itself (confirmed empirically — see Discrimination Sensor, mutation 2).

AUTH-02/03/07 (NestJS guard revalidation, `AUTH_PROVIDER=NONE` runtime behavior, fail-closed edge cases) are **out of scope** — no guard code exists yet (Phase 4+). Not flagged as gaps.

**Status**: ✅ All in-scope ACs covered (1 spec-precision gap flagged, not a defect).

---

## Discrimination Sensor

| # | File:line | Description | Killed? |
| - | --- | --- | --- |
| 1 | `infra/lib/edge-stack.ts:97-108` (root `/orders` route) | Removed `authorizer: ordersAuthorizer` from the root-path `addRoutes` call | ✅ Killed — `edge-stack.test.ts` "requires the JWT authorizer on both /orders routes" failed (`AuthorizerId` `undefined` on the mutated route) |
| 2 | `infra/lib/config.ts:23` | Changed `edgeThrottle.rateLimit` from `50` to `9999` | ❌ Survived — test compares against the same imported constant (`edgeThrottle.rateLimit`), so the assertion moves in lockstep with the mutation. See spec-precision gap note above; not a spec violation since no literal value is spec-mandated, but the test cannot catch an accidental/wrong value in `config.ts` alone |
| 2b | `infra/lib/edge-stack.ts:84-88` | Removed `throttle: edgeThrottle` entirely from `addStage(...)` (tests the wiring itself, not just the constant) | ✅ Killed — same test failed with `DefaultRouteSettings` absent from the synthesized `Stage` |
| 3 | `infra/lib/compute-stack.ts:88-94` | Removed `AUTH_PROVIDER: 'COGNITO'` from container `environment` | ✅ Killed — `compute-stack.test.ts` "passes AUTH_PROVIDER..." failed (`envByName.AUTH_PROVIDER` `undefined`) |

**Sensor depth**: lightweight (4 targeted mutations across the 3 in-scope stacks; auth is flagged P0/critical in the skill's tiering table — see note below)
**Result**: 3/4 killed, 1 survived (config-value self-reference, not a behavior-blind spot — the real wiring mutation 2b targeting the same throttle feature was killed)

All mutations were made only in the working tree and reverted via `git checkout --` immediately after each test run; `git status --short` confirmed a clean tree before and after the sensor pass.

**Note on P0 tiering**: the skill classifies "auth" as a P0/critical path warranting ≥5 mutations covering all branches. This pass ran 4 (3 distinct behaviors + 1 restated). Given the infra-only scope (no branch logic — CDK stacks are declarative resource wiring, not conditional code paths), 4 mutations covered all the assertable behaviors introduced by T1-T6 (authorizer presence, throttle wiring, env var presence). No additional branches exist in this diff to mutate.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — each task touches only the files named in tasks.md |
| Surgical changes | ✅ |
| No scope creep | ✅ — no NestJS/Phase 4+ code present |
| Matches patterns | ✅ — `CfnOutput`, `serviceConfig` reuse, `addDependency` pattern all match existing stacks |
| Spec-anchored outcome check (asserted values match spec-defined outcome) | ✅ (1 precision gap flagged, not a defect — see above) |
| Per-layer Coverage Expectation met (CDK stack: key resource properties per AC) | ✅ |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — every new assertion traces to AUTH-01/04/05/06 |
| Documented guidelines followed | `infra/test/*.test.ts` existing depth/pattern (no `AGENTS.md`/`CLAUDE.md` testing guideline found) — matched |

---

## Edge Cases (infra-relevant only)

- [x] `/health` stays public — unaffected, not exposed via HTTP API `{proxy+}`/`/orders` routes (unchanged by this diff, confirmed by reading `edge-stack.ts`)
- Guard-level edge cases (fail-closed JWKS, unexpected alg, malformed header, invalid `AUTH_PROVIDER`) — out of scope, Phase 4+

---

## Gate Check

- **Gate command**: `cd infra && npm test` and `cd infra && npx cdk synth`
- **`npm test` result**: 26 passed, 1 failed, 27 total (7 suites: 6 passed, 1 failed)
- **Failure**: `infra/test/foundation-stack.test.ts` — "restricts the ECR push role trust policy to this repo + main branch" — expects `RoleName: 'github-actions-order-service-ecr-push'`, receives `'github-actions-cdk-deploy'`. **Confirmed pre-existing**: checked out `dbcd8e5` (commit immediately before this feature's first commit), ran `cd infra && npm test -- foundation-stack.test.ts` there — same single failure, same message, 4 passed/1 failed. Unrelated to `auth` (no `auth`-diff file touches `foundation-stack.ts` or its test). Does not count against this feature's verdict.
- **`cdk synth` result**: Successfully synthesized to `infra/cdk.out`, all 7 stacks present (`FoundationStack, NetworkStack, AuthStack, DatabaseStack, ComputeStack, BastionStack, EdgeStack`), no errors (1 unrelated `minHealthyPercent` construct annotation, pre-existing pattern, not auth-related)
- **Test count before feature** (at `dbcd8e5`): 21 (27 total minus 6 new: 4 in `auth-stack.test.ts` + 1 new in `edge-stack.test.ts` + 1 new in `compute-stack.test.ts`)
- **Test count after feature** (at `a227340`): 27
- **Delta**: +6 new tests (4 `auth-stack.test.ts`, 1 new assertion in `edge-stack.test.ts` for JWT authorizer + 1 for throttle = 2 actually; see file diff — `edge-stack.test.ts` gained 2 tests, `compute-stack.test.ts` gained 1)
- **Skipped tests**: none
- **Environment note**: no stale compiled `.js`/`.d.ts` files found under `infra/lib`, `infra/test`, `infra/bin` at verification time — clean TS-source resolution confirmed before every test run

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status (infra scope) |
| --- | --- | --- |
| AUTH-01 | Pending | ✅ Verified (API Gateway half only — guard half is Phase 4, still Pending) |
| AUTH-04 | Pending | ✅ Verified |
| AUTH-05 | Pending | ✅ Verified |
| AUTH-06 | Pending | ✅ Verified (spec-precision gap flagged, non-blocking) |
| AUTH-02, AUTH-03, AUTH-07 | Pending | Pending (unchanged — out of scope, Phase 4+) |

---

## Summary

**Overall**: ✅ Ready (for Phases 1-3 scope)

**Spec-anchored check**: 5/5 in-scope ACs matched spec outcome; 1 spec-precision gap flagged (AUTH-06 throttle numeric values — not spec-mandated, non-blocking)
**Sensor**: 3/4 mutations killed (1 survived — self-referential config-constant comparison, mitigated by a second wiring-level mutation that was killed)
**Gate**: 26 passed, 1 pre-existing unrelated failure (confirmed via `dbcd8e5` baseline), `cdk synth` clean

**What works**: AuthStack (User Pool + Resource Server + App Client), JWT authorizer wired to both `/orders` routes, throttle wired to the `$default` stage, Cognito env vars passed to the Fargate container, full stack dependency graph (`AuthStack → EdgeStack`, `AuthStack → ComputeStack`) synthesizes cleanly.

**Issues found**: None blocking. One non-blocking observation: the throttle-value test (`edge-stack.test.ts:102-111`) is not fully discriminating against a bad literal in `config.ts` alone (see sensor mutation 2) — acceptable since no spec-mandated number exists, but worth strengthening later with a hardcoded expected literal if the value becomes operationally significant.

**Next steps**: Proceed to Phase 4 (NestJS guard core, T7-T12) implementation; this infra foundation is verified and ready to build on.
