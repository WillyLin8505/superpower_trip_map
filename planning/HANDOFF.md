# Handoff Log

Manager-owned aggregation file. Worker Sessions should provide handoff summaries in their final response. Manager may paste or summarize them here after review.

## Handoff Protocol

A Worker Session must end with:

1. Task ID and title.
2. Final status: `completed`, `blocked`, or `needs_review`.
3. Modified files list.
4. Concise summary of changes.
5. Exact commands run and results.
6. Known risks and follow-ups.
7. Manager decisions needed.

## Worker Handoff Template

```md
# Handoff — TASK-xxx: Task Title

## Status
completed | blocked | needs_review

## Modified Files
- `path/to/file`

## Summary
- ...

## Tests / Checks
- `command` — pass/fail and relevant output

## Risks / Notes
- ...

## Manager Decisions Needed
- ...

## Suggested Next Tasks
- ...
```

## Current Handoffs

No worker handoffs recorded yet after creation of the multi-session planning workflow.
