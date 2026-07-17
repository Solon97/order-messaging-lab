# LESSONS — auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation — do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 — Verify runbook/CLI commands against the actual compiled output tree and package.json scripts (grep for the referenced file path and script name) before marking a docs task done.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `infra` · harmful: 0
- features: aws-deploy
- evidence: AWSD-05 / infra/README.md:67-72 (infra)
- last seen: 2026-07-15T21:52:02Z

### L-002 — When two CDK stacks each need to reference a resource the other stack owns, break the cycle with a post-construction wiring method invoked from the app entrypoint instead of passing the resource as a cross-stack prop in either direction.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `infra` · harmful: 0
- features: aws-deploy
- evidence: design.md SPEC_DEVIATION T8/T9; infra/lib/edge-stack.ts:94-105 (infra)
- last seen: 2026-07-15T21:52:08Z

### L-003 — When testing header-format validation (e.g. required prefix like 'Bearer '), assert the guard rejects before reaching downstream verification (e.g. spy that the verifier is never called), not just that the final response is a 401 — a downstream fallback can mask a missing format check.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `auth,guards` · harmful: 0
- features: auth
- evidence: src/shared/auth/cognito-auth.guard.ts:51 (mutation 2, validation.md Discrimination Sensor) (auth,guards)
- last seen: 2026-07-17T18:29:23Z

### L-004 — When a spec leaves a numeric threshold unspecified (e.g. throttle rate/burst), still assert against a hardcoded literal in the test, not the same constant the implementation imports, so the test can catch an accidental change to that constant.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `infra,cdk` · harmful: 0
- features: auth
- evidence: infra/test/edge-stack.test.ts:102-111 (AUTH-06, validation.md Spec-Anchored ACs) (infra,cdk)
- last seen: 2026-07-17T18:29:23Z

### L-005 — When a CDK L2 interface (e.g. cognito.IUserPool) lacks a property the design needs (e.g. userPoolProviderUrl), check whether the concrete class exposes it before designing against the interface — document the narrowing as a SPEC_DEVIATION rather than reshaping the interface.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `infra,cdk` · harmful: 0
- features: auth
- evidence: infra/lib/edge-stack.ts:14-16 (SPEC_DEVIATION marker) (infra,cdk)
- last seen: 2026-07-17T18:29:23Z

## Quarantined (failed when applied — ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
