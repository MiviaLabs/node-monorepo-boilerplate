# Memory Lifecycle Governance

## Purpose

Turn verified failures and decisions into reusable prevention without creating an untrusted log.

## Applies

Planning, implementation, review, validation, task closure, and updates to the memories directory.

## Rules

- Read matching lessons and risk patterns before planning or implementation; declare prevention checks in the task.
- Record meaningful failed assumptions, review findings, and gate failures before closure.
- Keep stable facts and decisions in memories/MEMORY.md; keep lessons concise and structured; keep risk patterns about matching and prevention; keep run evidence local to its task.
- Promote repeated or high-severity lessons into a guardrail, standard, test, schema, template, or validation command before closure.
- Never store secrets, credentials, customer data, raw prompts, or unverifiable guesses in memory.
- Prefer updating an existing verified entry over adding duplicates. Date and identify durable decisions.

## Verification

Closure must show prior lessons reviewed, mistakes considered, lessons captured, future checks, and recurrence/residual risk. Verify lesson claims against the current tree and canonical catalog.

## Authority

This file governs learning behavior. The memories directory is advisory context, task evidence is run-specific, and core-guardrails.md owns blocking rules.
