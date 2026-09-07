---
id: typescript_nounusedparameters_prefix_unused_params_with_4e76a7c1486cb72b733711434a1134a2
title: 'TypeScript noUnusedParameters: prefix unused params with _'
content: 'TypeScript noUnusedParameters convention in this monorepo'
importance: medium
x-scope: project
x-verdict: neutral
tags: [typescript, noUnusedParameters, monorepo, convention]
updated: 2026-09-08
---

# TypeScript noUnusedParameters: prefix unused params with \_

## Summary

TypeScript noUnusedParameters convention in this monorepo

## What worked

- Repo has strict noUnusedParameters TS setting; required for any function param that is part of a signature contract but not used in the implementation body
- Hit when adding MockRedis.scan() to packages/redis/src/client.ts -- had to rename `cursor` to `_cursor` (and `_matchFlag`, `_countFlag`, `_count`) to satisfy the linter without breaking the ioredis signature parity

## What did not work

- none

## Why

Cost one failed commit cycle when adding signature-parity parameters; the convention is prefix-with-underscore (idiomatic TS), not removal of the param.

## References

- none
