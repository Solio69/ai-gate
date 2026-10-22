## Standing requirements for this preset

The user has explicitly requested strict TDD for code changes. Treat tests as requested even if an individual `spec.md` does not repeat this process rule. Generate concrete Red → Green → Refactor tasks, with Red before dependent production code and with actual project paths. Never treat an import, dependency, or environment failure as Red evidence. For a task without meaningful executable behavior, specify a proportionate alternative check in `plan.md` and `tasks.md`; do not invent a test that merely mirrors the change.

Use the resolved `tasks-template.md` from this preset. The official task-generation workflow follows below.
