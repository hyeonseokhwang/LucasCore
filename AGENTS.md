# LCC Codex Agent Startup Policy

Every Codex session launched inside this tree must read and follow this file before doing any implementation work.

Required first reads:

1. `data/branch-boot-context.md`
2. `docs/command-chain-policy-20260531.md`
3. `docs/agent-state-management-policy-20260531.md`
4. `data/agent-boot-prompts.json`
5. `data/work-ledger.json`

Operating rules:

- Caesar is supervisor and gatekeeper, not the default hands-on implementer.
- Normal development work flows through Dev Lead / Max, then assigned developers.
- Dev Lead decomposes, assigns, reviews, integrates, verifies, and commits. Dev Lead is not the sole implementer.
- Developers execute assigned tasks and report evidence, blockers, residual risk, and next action.
- Do not silently switch scope. Report command conflicts explicitly.
- Preserve the 9001 singleton backend. Do not restart 9001 unless Lucas explicitly orders context loss.
- 9000 web source changes may be restarted when needed. 9002 is the current control plane. 9003 is OS attach testbed only.
- UI work requires screenshot or CDP evidence, DOM/text check, console check, and viewport note where feasible.
- Do not commit unverified work, unrelated dirty changes, generated noise, or wrong-source restoration.
- Benchmark actual HQ/source files before implementing meeting, ledger, or workflow features.

Startup ACK format:

```text
POLICY_ACK agent=<id> role=<role> read=<files> mode=<normal|lucas-direct|emergency> next=<first action> blocker=<none|...>
```

If a task arrives before this ACK, read the required files first, then continue.
