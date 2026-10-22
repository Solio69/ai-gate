# Grooming extension

This extension adds `$speckit-grooming-prepare` to Codex. It helps discuss an already chosen development task before creating `spec.md`: it inspects context, compares options, asks necessary questions, and hands the agreed summary to `$speckit-specify`.

From an initialized project's directory, run:

```powershell
specify extension add "C:\path\to\codex-speckit-workflow\extension\grooming" --dev
```

Replace the sample path with the location of your copy. The grooming discussion stays in chat; no separate file is created. For an idea that has not yet become a development task, the official Assess extension can be installed separately. See the [main README](../../README.md) for the complete setup.
