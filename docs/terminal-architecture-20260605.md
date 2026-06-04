## Terminal Architecture 2026-06-05

### Scope

- This document covers the protected terminal path for PTY output normalization, retained replay buffers, prompt normalization, and the minimum regression SOP required before promotion.

### Normalization Policy

- PTY output is normalized to `CRLF` for visible line breaks.
- Existing `CRLF` stays `CRLF`.
- Bare `CR` becomes `CRLF`.
- Bare `LF` becomes `CRLF`.
- Escape sequences are preserved as escape payload, not rewritten character-by-character.
- UTF-8 decoding is incremental. Incomplete trailing bytes are carried into the next PTY chunk instead of being replaced early.

### Function Responsibilities

- `normalize_prompt_body()`
  - Input-side normalization only.
  - Converts `CRLF` and bare `CR` to `LF`.
  - Trims trailing newlines before submit.
  - Must remain the shared normalization rule for REST and WS prompt-text paths.

- `prompt_body_from_write_session()`
  - REST input extractor for `WriteSession`.
  - Delegates normalization to `normalize_prompt_body()`.

- `prompt_body_from_ws_value()`
  - WS input extractor for terminal protocol prompt-text messages.
  - Delegates normalization to `normalize_prompt_body()`.

- `PtyOutputProcessor`
  - PTY output pipeline entry point.
  - Performs incremental UTF-8 decode, escape-aware newline normalization, and bounded batch flush.
  - Prevents partial UTF-8 tail loss and avoids flushing incomplete escape fragments.

- `append_terminal_output()`
  - Single append path for ring buffer, terminal snapshot, and websocket broadcast.
  - Keeps volatile retention and live replay updates aligned.

### Buffer And Replay Policy

- `TERMINAL_SCREEN_BUFFER_BYTES = 256 KB`
- `TERMINAL_RING_BUFFER_BYTES = 256 KB`
- `PTY_READ_BUFFER_BYTES = 8 KB`
- `PTY_OUTPUT_BATCH_FLUSH_MS = 50 ms`
- Web replay and card replay limits follow the same 256 KB volatile screen policy.
- Durable evidence remains the terminal log path, not the browser replay window.

### Verification SOP

Run before commit or promotion when this contract changes:

1. `cargo test --manifest-path apps/api/Cargo.toml`
2. `cargo check --manifest-path apps/api/Cargo.toml`
3. Confirm prompt/newline tests still pass.
4. Confirm these regression tests pass:
   - `test_bare_cr_to_crlf`
   - `test_utf8_boundary_korean`
   - `test_ring_buffer_size`
   - `test_batch_flush_escape_sequence`
   - `test_ws_rest_normalize_consistency`
5. If web terminal options change, also run the relevant web test/build checks.

### Regression Guardrails

- Do not merge prompt text and submit Enter into one write path.
- Do not bypass prompt-text / prompt-submit through raw PTY injection.
- Do not silently shrink replay buffers after this contract.
- Do not reintroduce `String::from_utf8_lossy` as the first PTY decode step for streaming chunks.
- Do not flush incomplete escape fragments to WS/UI output.
