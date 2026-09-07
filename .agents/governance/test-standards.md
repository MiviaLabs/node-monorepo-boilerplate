# Test Governance

## Purpose

Match test depth to the behavior and risk being changed.

## Applies

New logic, bug fixes, persistence, messaging, authorization, session, tenant propagation, and user journeys.

## Rules

- Use RED → GREEN → REFACTOR for new logic and bug fixes unless documentation-only, pure refactor, or operational/configuration work makes it inapplicable.
- Prove the initial failure before claiming a bug is fixed.
- Keep unit tests focused on logic, integration tests on boundaries, and E2E tests on real journeys.
- Use real stack behavior for auth, session, tenant propagation, persistence, and messaging; do not call mocked internals end-to-end coverage.
- When fixing a known failure mode, add or strengthen regression coverage that fails on the old mistake.
- Record commands run and intentionally skipped scopes.

## Verification

Run the narrowest proving tests, then every required task gate. Use real full-stack E2E for protected flows and report failures without weakening the gate.

## Authority

This file governs test strategy. Guardrails and task contracts define mandatory gates; specialized skills select concrete commands.
