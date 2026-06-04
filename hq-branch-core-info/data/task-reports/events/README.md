# Task Report Event Fragments

This directory stores file-based JIRA comment/work-log fragments.

Rules:

- Main task files under `data/task-reports/` have one active writer.
- Agents other than the active writer add event fragments here.
- The active writer later merges accepted fragments into the main task file.
- Filenames should use:

```text
<task-id>-<agent-id>-<yyyymmdd-hhmmss>-<event-kind>.md
```

Required fields:

```text
task_id:
author:
state:
understanding:
evidence:
risk:
next:
```
