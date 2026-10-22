---
description: "Discuss an already-defined coding task and agree its scope before Spec Kit"
---

# Task grooming

## User input

$ARGUMENTS

## Purpose

Prepare one bounded development task before `$speckit-specify`. Keep the discussion and its short agreed summary in the chat. Do not create a separate grooming file. During grooming, do not change code, tests, configuration, or specifications.

## Steps

1. Read the applicable `AGENTS.md`, constitution, current specifications, and relevant parts of the repository. Verify claims against the current code. If the project is empty, use only goals the user has actually stated and identify missing context.
2. Identify the desired observable result, scope, affected scenarios, dependencies, and acceptance checks. Separate verified facts from hypotheses. Do not invent the stack, requirements, or permissions.
3. For a meaningful technical choice, present viable options grounded in established engineering practice. Explain how they differ, their benefits, costs, and risks, then recommend an option for this context. If only one option is reasonable, explain why. Do not manufacture alternatives for a small fix.
4. Ask only questions whose answers would change the decision or acceptance criteria. Discuss them with the user; silence is not agreement.
5. When the approach is clear, present a short summary in chat: result, scope, chosen approach, acceptance criteria, checks, and remaining open questions. Obtain explicit agreement to carry out that scope. Do not ask again for approval already given in this chat.
6. After agreement, pass the approved summary to `$speckit-specify` to create `spec.md`. Do not save a separate grooming document. Codex may then prepare `plan.md` and `tasks.md`, run read-only analysis, save the full report to `analysis.md` in a separate action, and implement the agreed task. If a new material decision about behavior, data, security, or scope emerges, discuss that decision with the user before the affected implementation.

## Language

Reply in the language the user used for the request, unless they explicitly choose another language. Write project documentation in that language too. Preserve required Spec Kit filenames, IDs, markers, and command syntax. If the user has not explicitly chosen a documentation language and the request uses multiple languages or conflicts with the existing documentation language, ask which language to use before writing.

## Assess and grooming

If the idea is still unformed and the user wants to decide whether to pursue it, suggest the official Assess extension as a separate optional stage. Grooming applies to an already chosen idea and a concrete development task.
