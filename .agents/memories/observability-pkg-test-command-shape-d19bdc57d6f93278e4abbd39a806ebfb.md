---
id: observability_pkg_test_command_shape_d19bdc57d6f93278e4abbd39a806ebfb
title: 'Observability pkg test command shape'
content: 'Observability pkg uses tsx --test (Node Test Runner), NOT pnpm jest. project.json test target = npx tsx --test src/**/*.test.ts.'
importance: medium
x-scope: project
x-verdict: neutral
tags: [pnpm, observability, tsx]
updated: 2026-09-08
---

# Observability pkg test command shape

## Summary

Observability pkg uses tsx --test (Node Test Runner), NOT pnpm jest. project.json test target = npx tsx --test src/\*_/_.test.ts.

## What worked

pnpm exec tsx --test src/**tests**/\*_/_.test.ts is the actual test command (configured in project.json); pnpm jest fails because tests are .ts

## What did not work

- none

## Why

Brief said pnpm test / pnpm exec jest but those fail. project.json is authoritative.

## References

- none
