---
id: audit_agent_budget_hint_prevents_exploration_cutoff_failures_60cc727c0e1af9d7c85f00c90a962b0d
title: 'Audit agent budget hint prevents exploration-cutoff failures'
content: 'Hard tool-call budget helps audit agents finish'
importance: medium
x-scope: project
x-verdict: neutral
tags: [audit, agent-reliability, budget, exploration-cutoff]
updated: 2026-09-08
---

# Audit agent budget hint prevents exploration-cutoff failures

## Summary

Hard tool-call budget helps audit agents finish

## What worked

- When a previous audit was cut off by the "10 consecutive reads" reminder or stopped mid-exploration, retry with a HARD CAP like "MUST conclude within 15 tool calls; after reading each file, immediately post a finding message and move to verification." This worked for both queues-retry (cycle 4) and tasks/test-utils/types-v2 (cycle 5) -- the retried agents stayed focused and produced real fixes with verification.

## What did not work

- none

## Why

Saves a re-dispatch when the original audit agent trips the system reminder or runs out of budget mid-analysis. The retry-with-budget pattern is cheaper than re-doing the work from scratch.

## References

- none
