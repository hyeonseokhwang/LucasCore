# 9001 Restart Resume Context - 2026-06-03 Terminal Tail Runtime

## Why Restart

Lucas approved restarting 9001 via batch after preserving context.

Current terminal issue:
- Card/fullscreen must use the same background PTY source.
- Fullscreen is only a larger view of the same source; no separate terminal implementation.
- Card view Caesar is blank/broken because live 9001 still emits `previewLen=1024`.
- `data/terminal-runtime-config.json` was changed to 32768 bytes, but live 9001 did not apply it.
- Caesar API sample before restart: preview tail contains mostly cursor erase/spinner fragments, `preview_text` only `[74;2H...6...`.
- Max API sample is readable because its useful text happens to fit inside the 1024-byte tail.

## Current Source State

HEAD:
- `860ab3a fix: simplify terminal views to shared tail preview`
- Not pushed yet.

Relevant committed source changes:
- `apps/api/src/main.rs`
- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/terminalCardComposer.ts`
- `apps/web/src/terminalCardComposer.test.ts`

Runtime config changed after commit and is currently dirty:
- `data/terminal-runtime-config.json`
- Values set to:
  - `preview_bytes`: 32768
  - `card_replay_bytes`: 32768
  - `max_replay_bytes`: 32768
  - `ring_buffer_bytes`: 32768

## Verified Before Restart

Tests already passed before this restart window:
- `npm --prefix apps/web test`
- `npm --prefix apps/web run build`
- `cargo test --manifest-path apps/api/Cargo.toml`

Live 9001 before restart:
- PID: 11852
- Executable: `D:\Lucas Core v0.1\target-9001\debug\lcc-core-api.exe`
- Health OK
- Sessions: `ceo`, `dev-lead`
- Preview still 1024 bytes, so current live backend is not applying the intended 32KB runtime tail.

## Restart Command

Use:

```powershell
Start-Process -FilePath "D:\Lucas Core v0.1\scripts\restart-lcc-9000-9001.bat" -WorkingDirectory "D:\Lucas Core v0.1"
```

The batch stops listeners on ports 9000 and 9001, then starts:
- API 9001 via `scripts\dev-api.ps1 -Port 9001`
- Web 9000 via `scripts\dev-web.ps1 -Port 9000 -ApiOrigin http://127.0.0.1:9001`

## Resume Actions After Restart

1. Re-read policies required by `AGENTS.md`.
2. Confirm ports:
   - `9001 /api/health`
   - `9001 /api/sessions`
   - `9000` reachable
3. Confirm API session preview length is greater than 1024 and Caesar has useful terminal text.
4. Check card view and fullscreen use the same source and render Caesar/Max.
5. Run web test/build and cargo test if source changed further.
6. Commit only scoped terminal/runtime config changes after verification.

## Do Not Do

- Do not restart 9001 again unless Lucas approves.
- Do not switch to newline/PTTY injection work until terminal card/fullscreen display is stable.
- Do not reintroduce per-card terminal attach or separate fullscreen renderer.
- Do not commit unrelated dirty files.
