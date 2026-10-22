---
description: "Test-first tasks for a bounded Spec Kit code change"
---

# Tasks: [Feature name]

**Inputs**: `spec.md`, `plan.md`, and applicable design files in this feature directory.

<!-- Replace every placeholder and example. Use paths from the real repository, never these generic names verbatim. Preserve the official checklist format and sequential task IDs. -->

## Setup and dependencies

- [ ] T001 [Only actual prerequisite work for this feature, with project-relative path]

## Story or change 1: [Name]

**Goal**: [Observable outcome]

**Independent check**: [How to verify this outcome alone]

- [ ] T002 [US1] Red: add or change the automated test for [agreed behavior] in [actual test path], run it, and confirm the failure is due to missing or incorrect behavior.
- [ ] T003 [US1] Green: implement the smallest change in [actual source path] and rerun the affected test.
- [ ] T004 [US1] Refactor: improve [actual source/test paths] without changing behavior and rerun the affected test.

<!-- Repeat the story/change section only as needed. Keep tests before their dependent implementation tasks. If no meaningful executable behavior changes, replace Red/Green/Refactor placeholders with concrete review or validation tasks and explain the exception in plan.md. -->

## Analysis and final verification

- [ ] TXXX Run the read-only `$speckit-analyze` pass after completing tasks.md; save the full report separately in `analysis.md`, resolve blocking findings, and rerun analysis when artifacts change.
- [ ] TXXX Run the checks chosen in `plan.md`; record commands, Passed/Failed/Blocked/NotRun and evidence in `verification.md`.
- [ ] TXXX Review the diff against `spec.md`, confirm scope and secret hygiene, and report remaining limitations.

## Dependencies

- [List real task dependencies. Do not mark Red and its dependent Green as parallel.]

## Completion criteria

- [ ] Every implemented behavior has genuine Red evidence before its production change.
- [ ] Affected tests pass after Green and Refactor.
- [ ] The saved `analysis.md` has no unresolved blocking finding.
- [ ] `verification.md` honestly records performed and unperformed checks.
- [ ] Changes match the agreed scope; Git actions follow the task-specific authorization.
