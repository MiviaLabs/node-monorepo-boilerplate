---
id: subagent_reliability_and_pnpm_sandbox_gotchas_e42712fd3932ec89f875d37faaef2274
title: 'Subagent reliability and pnpm-sandbox gotchas'
content: 'Subagent reliability: always verify claimed bug fixes by running their tests against unchanged source. Catches both run-timeouts (cut off mid-fix) and over-eager "task complete" reports (test added, source change forgotten).'
importance: high
x-scope: project
x-verdict: neutral
tags: [subagent, bug-audit, tdd, verification, commitlint, pnpm-shim]
updated: 2026-09-08
---

# Subagent reliability and pnpm-sandbox gotchas

## Summary

Subagent reliability: always verify claimed bug fixes by running their tests against unchanged source. Catches both run-timeouts (cut off mid-fix) and over-eager "task complete" reports (test added, source change forgotten).

## What worked

- Verify EVERY agent-claimed fix by running the tests myself -- agents have shipped failing tests against unchanged source (both cut-off mid-run and finished-without-fix scenarios)
- For pnpm: the only working shape is `env PATH=/home/mac/projects/mivialabs/node-monorepo-boilerplate/node_modules/.bin:/usr/bin:/bin pnpm ...` from repo root (the env-leading-args form that env actually parses). The form `env PATH=... pnpm ...` quoted differently may be misread
- Subagents run from package cwd (e.g. packages/events) so they do NOT auto-resolve node_modules/.bin -- always set the absolute path
- For commitlint, no "events" / "encryption" / "errors" / "db-core" / "db-outbox" scope exists -- closest fits: database (db-\*), platform (events), security (cryptographic), docs (memory entries), ci (tooling)
- TDD validation: when an agent claims a bug fix, the test should fail WITHOUT the source change and pass WITH it. Always run the test before staging

## What did not work

- Initial audit-encryption dispatch crashed after 10 steps with no final reply (silent agent crash)
- Initial audit-errors dispatch tried `env PATH=$(pwd)/node_modules/.bin:/usr/bin:/bin pnpm ...` -- env treated PATH as a command name, not env var; agent gave up after 12 steps
- Initial audit-events dispatch was cut off mid-fix (last line: "Failing as expected. Now apply the fix:") -- agent found bug, wrote failing test, then never applied the source fix before run timed out
- After re-dispatch with corrected env syntax, audit-events agent still missed applying the markAsDeadLettered fix -- only added the failing test, did NOT modify outbox.repository.ts. Final report only mentioned the eventId fix.
- I caught it by running the failing test against the unchanged source -- it failed with `expected null, received undefined`, proving the test asserts a fix that was never applied

## Why

Caught an events audit agent that wrote a failing test for markAsDeadLettered but never applied the source fix -- final report claimed only the eventId fix. Cost one extra test run + a one-line patch before commit. Pattern will recur: long audit agents can time out mid-fix OR finish while believing the fix is in place.

## References

- none
