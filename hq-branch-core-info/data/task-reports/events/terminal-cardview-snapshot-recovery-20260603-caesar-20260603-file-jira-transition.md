# Event Fragment - File-Based JIRA Transition

task_id: terminal-cardview-snapshot-recovery-20260603
author: Caesar
state: understanding-check
understanding: Lucas clarified that the task file is both the future report and the live work tracker. It must be detailed enough to prevent drift, and assignees must ask when unsure instead of guessing.
evidence: Updated main task ticket with status, writer lock, workflow states, event fragment path, owner rules, and understanding gate.
risk: File-based operation can still conflict if multiple agents edit the main ticket directly.
next: Enforce single-writer main ticket plus event-fragment reports. Ask Max to prove understanding before any developer edit.
