# Agent workflows

Workflow YAML describes when a role or team acts, what it must produce, and which gates block closure.

- `delivery-lifecycle.yaml` is the end-to-end delivery state machine.
- `review-cycle.yaml` is the bounded review-and-fix loop.

Workflows orchestrate repository tooling; they do not replace CI, tests, hooks, or application authorization. A phase output is an input to the next phase, not proof that the phase succeeded. Proof comes from task evidence containing exact commands and outcomes.
