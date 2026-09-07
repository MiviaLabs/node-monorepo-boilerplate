---
id: boilerplate_packages_are_intentional_never_delete_unreferenced_packages_here_40bc1d67f2b9729704b91f73a609025b
title: 'Boilerplate packages are intentional — never delete unreferenced packages here'
content: 'CORRECTION to the earlier packages/ audit: this is a BOILERPLATE repo — packages with zero inbound imports (schema, i18n, secrets) are intentional starter content, NOT dead code. They were wrongly deleted in the delivery run, then fully restored from the original commit including all references (tsconfig paths, root scripts, jest/webpack/tsconfig mappings, Dockerfiles, CI, docs generators, graph d'
importance: high
x-scope: project
x-verdict: good
tags: [boilerplate-semantics, correction, schema, i18n, secrets, git-history, squash, do-not-delete]
updated: 2026-09-08
---

# Boilerplate packages are intentional — never delete unreferenced packages here

## Summary

CORRECTION to the earlier packages/ audit: this is a BOILERPLATE repo — packages with zero inbound imports (schema, i18n, secrets) are intentional starter content, NOT dead code. They were wrongly deleted in the delivery run, then fully restored from the original commit including all references (tsconfig paths, root scripts, jest/webpack/tsconfig mappings, Dockerfiles, CI, docs generators, graph d

## What worked

- none

## What did not work

- none

## Why

The user explicitly corrected the removal: schema/i18n/secrets are boilerplate showcase packages meant to be consumed by downstream users of the template, so "no live references inside the repo" is expected, not a defect. Deletion criteria that hold for product repos do not apply here. Future audits should flag unreferenced packages as "unused internally, keep for template consumers" at most.

## References

- none
