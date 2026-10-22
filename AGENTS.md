# Coding workflow

These rules apply to development tasks in this repository. Follow the current user request, `.specify/memory/constitution.md`, and any more specific project rules.

## Language

- Reply in the language the user used to address you, unless they explicitly request another language.
- Write new or updated project documentation in that same language. Preserve required Spec Kit filenames, IDs, markers, and command syntax. Translate explanatory prose and headings where doing so keeps the required structure intact.
- If the user has not explicitly chosen a documentation language and the request mixes languages, gives too little natural-language context, or conflicts with the language already used in project documentation, ask which language to use before writing. Do not silently switch a project's documentation language.

## Before every task

1. Start grooming with `$speckit-grooming-prepare`. For follow-up review fixes within the same task, a short pass is enough: check the feedback, scope, and acceptance criteria. Do not invent missing requirements.
2. During grooming, inspect only relevant context and do not change code or documents. For material decisions, explain viable options, differences, benefits, risks, and a recommendation. Clarify open questions.
3. Present a short agreed task summary in chat: result, boundaries, approach, and acceptance criteria. Wait for explicit agreement to that scope. Silence is not agreement.
4. After agreement, prepare `spec.md` with `$speckit-specify`, then use applicable `$speckit-clarify`, `$speckit-plan`, `$speckit-checklist`, `$speckit-tasks`, analysis, and implementation. No repeated approval is required between these stages. The agreed `spec.md` becomes the durable task statement; do not create a separate grooming file.

## Before coding

- Run `$speckit-analyze` after `tasks.md`. This pass only reads artifacts and outputs a full report. **In a separate action after that pass**, save the full report without shortening it to the task's `analysis.md`. Do not claim the standard analyze command wrote the file itself.
- Resolve blocking technical inconsistencies within the agreed scope, rerun analysis, and update `analysis.md`. Discuss a new material decision about behavior, data, security, or scope with the user before the affected implementation.
- If the constitution still contains template placeholders, agree and complete it with `$speckit-constitution` before the first task. Do not invent project rules.

## Implementation and TDD

- Apply Red → Green → Refactor to every new or changed testable behavior: write and run an automated test that fails because the behavior is missing or wrong, make the smallest production change and pass the test, then refactor if useful and rerun affected tests. An environment, import, or installation error does not count as Red.
- For documentation, configuration, or other changes without testable behavior, define an appropriate check in `plan.md`. Do not write an artificial test that mirrors the implementation.
- Stay within the agreed scope. Use the repository's actual stack, commands, and conventions. Discuss a concrete need before installing dependencies or changing external systems.
- Record executed commands and outcomes in the task's `verification.md` as Passed, Failed, Blocked, or NotRun. Do not report an unperformed check as successful. Before handoff, compare code and documentation with `spec.md` and review the diff for unrelated changes and secrets.

## Git and permissions

- Agreement to work after grooming does not authorize a commit or push. For each task, establish who will commit and which branch is in scope. Without permission, leave changes uncommitted. Push, PR, merge, release, and history changes each require explicit authorization.
- Follow any stricter project Git policy. Never include someone else's changes in your commit.

<!-- SPECKIT START -->
Для сведений о стеке, структуре, локальном запуске и проверках текущей фичи
читайте specs/001-ai-gate-demo/plan.md.
<!-- SPECKIT END -->
