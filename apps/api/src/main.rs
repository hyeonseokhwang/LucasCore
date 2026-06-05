// CA Phase 1: module scaffold (no logic changes)
mod api;
mod app;
mod domain;
mod infra;
mod shared;

use crate::domain::canvas::canvas::{
    Canvas as DomainCanvas, CanvasMessage as DomainCanvasMessage,
    CanvasSection as DomainCanvasSection,
};
use crate::domain::memory::memory::MemoryEntry as DomainMemoryEntry;
use crate::domain::peer::peer::PeerMessage as DomainPeerMessage;
use crate::infra::persistence::work_ledger::WorkLedgerStore;
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post, put},
    Json, Router,
};
use chrono::{DateTime, Utc};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    env,
    io::{Read, SeekFrom, Write},
    net::{SocketAddr, ToSocketAddrs},
    path::PathBuf,
    sync::{Arc, Mutex as StdMutex},
    thread,
    time::{Duration as StdDuration, Instant},
};
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt},
    net::TcpStream,
    runtime::Handle,
    sync::{broadcast, Mutex, RwLock},
    time::{sleep, Duration},
};
use tower_http::{cors::CorsLayer, services::ServeDir, trace::TraceLayer};

#[derive(Clone)]
struct AppState {
    sessions: Arc<RwLock<HashMap<String, Arc<Mutex<TerminalSession>>>>>,
    terminal_buffers: Arc<StdMutex<HashMap<String, TerminalRingBuffer>>>,
    terminal_display_snapshots: Arc<StdMutex<HashMap<String, TerminalDisplaySnapshot>>>,
    terminal_last_nonempty_snapshots: Arc<StdMutex<HashMap<String, String>>>,
    tx: broadcast::Sender<ServerEvent>,
    canvas_store: CanvasStore,
    peer_store: PeerStore,
    work_ledger: WorkLedgerStore,
    memory_store: MemoryStore,
    daily_memory_store: DailyMemoryStore,
}

pub(crate) struct TerminalSession {
    pub(crate) meta: SessionMeta,
    pub(crate) _master: Box<dyn MasterPty + Send>,
    pub(crate) writer: Box<dyn Write + Send>,
}

const TERMINAL_SCREEN_BUFFER_BYTES: usize = 256 * 1024;
const SESSION_PREVIEW_LIMIT_BYTES: usize = TERMINAL_SCREEN_BUFFER_BYTES;
const TERMINAL_VOLATILE_BUFFER_MAX_BYTES: usize = TERMINAL_SCREEN_BUFFER_BYTES;
const TERMINAL_LOG_TAIL_BYTES: u64 = 32 * 1024;
const SESSION_LOG_VIEW_LIMIT_BYTES: u64 = TERMINAL_LOG_TAIL_BYTES;
const SESSION_LOG_MAX_TAIL_BYTES: u64 = TERMINAL_LOG_TAIL_BYTES;
const TERMINAL_WS_REPLAY_CARD_LIMIT_BYTES: u64 = TERMINAL_SCREEN_BUFFER_BYTES as u64;
const TERMINAL_WS_REPLAY_MAX_LIMIT_BYTES: u64 = TERMINAL_SCREEN_BUFFER_BYTES as u64;
const TERMINAL_LOG_ROTATE_BYTES: u64 = 512 * 1024;
const TERMINAL_LOG_FLUSH_INTERVAL_MS: u64 = 50;
const TERMINAL_LOG_FLUSH_CHUNK_BYTES: usize = 50 * 1024;
const TERMINAL_RING_BUFFER_BYTES: usize = TERMINAL_SCREEN_BUFFER_BYTES;
const PTY_READ_BUFFER_BYTES: usize = 8 * 1024;
const PTY_OUTPUT_BATCH_FLUSH_MS: u64 = 50;
const PTY_OUTPUT_BATCH_MAX_BYTES: usize = 8 * 1024;
const PROMPT_TEXT_FLUSH_DELAY_MS: u64 = 420;
const TERMINAL_ATTACH_CLEAR_PREFIX: &str = "\x1b[2J\x1b[3J\x1b[H";
const TERMINAL_PERSIST_LOGS_ENV: &str = "LCC_TERMINAL_PERSIST_LOGS";
const TERMINAL_RUNTIME_CONFIG_PATH_ENV: &str = "LCC_TERMINAL_RUNTIME_CONFIG";
const TERMINAL_RUNTIME_CONFIG_DEFAULT_PATH: &str = "data/terminal-runtime-config.json";
const MIN_TERMINAL_RESIZE_COLS: u16 = 40;
const MIN_TERMINAL_RESIZE_ROWS: u16 = 10;

#[derive(Debug, Clone)]
struct TerminalRingBuffer {
    data: String,
    max_bytes: usize,
}

impl TerminalRingBuffer {
    fn new(max_bytes: usize) -> Self {
        Self {
            data: String::new(),
            max_bytes,
        }
    }

    fn push(&mut self, value: &str) {
        // Standalone \r (not \r\n) = Codex TUI "overwrite current line".
        // Clear the current line and keep \r so xterm replay doesn't accumulate ghost lines.
        let mut chars = value.chars().peekable();
        while let Some(ch) = chars.next() {
            if ch == '\r' && chars.peek() != Some(&'\n') {
                if let Some(nl_pos) = self.data.rfind('\n') {
                    self.data.truncate(nl_pos + 1);
                } else {
                    self.data.clear();
                }
                self.data.push('\r');
            } else {
                self.data.push(ch);
            }
        }
        if self.data.len() > self.max_bytes {
            self.data = tail_string_by_bytes(&self.data, self.max_bytes);
        }
    }

    fn tail(&self, max_bytes: usize) -> String {
        tail_string_by_bytes(&self.data, max_bytes)
    }

    fn set_max_bytes(&mut self, max_bytes: usize) {
        self.max_bytes = max_bytes;
        if self.data.len() > self.max_bytes {
            self.data = tail_string_by_bytes(&self.data, self.max_bytes);
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum EscapeMode {
    Normal,
    Escape,
    Csi,
    Osc,
    Dcs,
    StringTerminated { saw_esc: bool },
}

#[derive(Debug, Default)]
struct Utf8IncrementalDecoder {
    carry: Vec<u8>,
}

impl Utf8IncrementalDecoder {
    fn decode(&mut self, chunk: &[u8]) -> String {
        if chunk.is_empty() {
            return String::new();
        }
        self.carry.extend_from_slice(chunk);
        let mut output = String::new();
        let mut consumed = 0;
        loop {
            let slice = &self.carry[consumed..];
            if slice.is_empty() {
                break;
            }
            match std::str::from_utf8(slice) {
                Ok(valid) => {
                    output.push_str(valid);
                    consumed = self.carry.len();
                    break;
                }
                Err(err) => {
                    let valid_up_to = err.valid_up_to();
                    if valid_up_to > 0 {
                        let valid =
                            std::str::from_utf8(&slice[..valid_up_to]).expect("valid prefix");
                        output.push_str(valid);
                    }
                    consumed += valid_up_to;
                    match err.error_len() {
                        Some(invalid_len) => {
                            let invalid_end = consumed + invalid_len;
                            output.push_str(&String::from_utf8_lossy(
                                &self.carry[consumed..invalid_end],
                            ));
                            consumed = invalid_end;
                        }
                        None => break,
                    }
                }
            }
        }
        if consumed > 0 {
            self.carry = self.carry[consumed..].to_vec();
        }
        output
    }

    fn finish(&mut self) -> String {
        if self.carry.is_empty() {
            return String::new();
        }
        let trailing = String::from_utf8_lossy(&self.carry).to_string();
        self.carry.clear();
        trailing
    }
}

#[derive(Debug)]
struct TerminalOutputNormalizer {
    prev_was_cr: bool,
    pending_escape: String,
    pending_mode: EscapeMode,
}

impl Default for TerminalOutputNormalizer {
    fn default() -> Self {
        Self {
            prev_was_cr: false,
            pending_escape: String::new(),
            pending_mode: EscapeMode::Normal,
        }
    }
}

impl TerminalOutputNormalizer {
    fn normalize(&mut self, value: &str) -> String {
        let mut output = String::with_capacity(value.len());
        let mut escape = std::mem::take(&mut self.pending_escape);
        let mut mode = std::mem::replace(&mut self.pending_mode, EscapeMode::Normal);

        for ch in value.chars() {
            match mode {
                EscapeMode::Normal => match ch {
                    '\x1b' => {
                        escape.push(ch);
                        mode = EscapeMode::Escape;
                        self.prev_was_cr = false;
                    }
                    '\r' => {
                        output.push('\r');
                        self.prev_was_cr = true;
                    }
                    '\n' => {
                        if self.prev_was_cr {
                            self.prev_was_cr = false;
                            output.push('\n');
                        } else {
                            output.push_str("\r\n");
                        }
                    }
                    _ => {
                        self.prev_was_cr = false;
                        output.push(ch);
                    }
                },
                EscapeMode::Escape => {
                    escape.push(ch);
                    mode = match ch {
                        '[' => EscapeMode::Csi,
                        ']' => EscapeMode::Osc,
                        'P' => EscapeMode::Dcs,
                        'X' | '^' | '_' => EscapeMode::StringTerminated { saw_esc: false },
                        _ if is_escape_final(ch) => {
                            output.push_str(&escape);
                            escape.clear();
                            EscapeMode::Normal
                        }
                        _ => EscapeMode::Escape,
                    };
                }
                EscapeMode::Csi => {
                    escape.push(ch);
                    if is_escape_final(ch) {
                        output.push_str(&escape);
                        escape.clear();
                        mode = EscapeMode::Normal;
                    }
                }
                EscapeMode::Osc => {
                    escape.push(ch);
                    if ch == '\x07' {
                        output.push_str(&escape);
                        escape.clear();
                        mode = EscapeMode::Normal;
                    } else if ch == '\x1b' {
                        mode = EscapeMode::StringTerminated { saw_esc: true };
                    }
                }
                EscapeMode::Dcs => {
                    escape.push(ch);
                    if ch == '\x07' {
                        output.push_str(&escape);
                        escape.clear();
                        mode = EscapeMode::Normal;
                    } else if ch == '\x1b' {
                        mode = EscapeMode::StringTerminated { saw_esc: true };
                    }
                }
                EscapeMode::StringTerminated { saw_esc } => {
                    escape.push(ch);
                    if saw_esc && ch == '\\' {
                        output.push_str(&escape);
                        escape.clear();
                        mode = EscapeMode::Normal;
                    } else if ch == '\x07' {
                        output.push_str(&escape);
                        escape.clear();
                        mode = EscapeMode::Normal;
                    } else {
                        mode = EscapeMode::StringTerminated {
                            saw_esc: ch == '\x1b',
                        };
                    }
                }
            }
        }

        self.pending_escape = escape;
        self.pending_mode = mode;
        output
    }

    fn is_idle(&self) -> bool {
        self.pending_escape.is_empty() && matches!(self.pending_mode, EscapeMode::Normal)
    }

    fn finish(&mut self) -> String {
        self.pending_mode = EscapeMode::Normal;
        std::mem::take(&mut self.pending_escape)
    }
}

#[derive(Debug)]
struct PtyOutputProcessor {
    decoder: Utf8IncrementalDecoder,
    normalizer: TerminalOutputNormalizer,
    pending_output: String,
    last_flush_at: Instant,
}

impl PtyOutputProcessor {
    fn new(now: Instant) -> Self {
        Self {
            decoder: Utf8IncrementalDecoder::default(),
            normalizer: TerminalOutputNormalizer::default(),
            pending_output: String::new(),
            last_flush_at: now,
        }
    }

    fn push_chunk(&mut self, chunk: &[u8], now: Instant) -> Option<String> {
        let decoded = self.decoder.decode(chunk);
        if !decoded.is_empty() {
            let normalized = self.normalizer.normalize(&decoded);
            if !normalized.is_empty() {
                self.pending_output.push_str(&normalized);
            }
        }
        self.flush_if_ready(now, false)
    }

    fn finish(&mut self, now: Instant) -> Option<String> {
        let trailing = self.decoder.finish();
        if !trailing.is_empty() {
            let normalized = self.normalizer.normalize(&trailing);
            if !normalized.is_empty() {
                self.pending_output.push_str(&normalized);
            }
        }
        let trailing_escape = self.normalizer.finish();
        if !trailing_escape.is_empty() {
            self.pending_output.push_str(&trailing_escape);
        }
        self.flush_if_ready(now, true)
    }

    fn flush_if_ready(&mut self, now: Instant, force: bool) -> Option<String> {
        if self.pending_output.is_empty() {
            if force {
                self.last_flush_at = now;
            }
            return None;
        }
        let age = now.saturating_duration_since(self.last_flush_at);
        let ready = force
            || (self.normalizer.is_idle()
                && (age >= StdDuration::from_millis(PTY_OUTPUT_BATCH_FLUSH_MS)
                    || self.pending_output.len() >= PTY_OUTPUT_BATCH_MAX_BYTES));
        if !ready {
            return None;
        }
        self.last_flush_at = now;
        Some(std::mem::take(&mut self.pending_output))
    }
}

fn is_escape_final(ch: char) -> bool {
    ('@'..='~').contains(&ch)
}

#[derive(Debug, Clone, Default)]
struct TerminalCell {
    ch: char,
    sgr: String,
}

#[derive(Debug, Clone)]
struct TerminalDisplaySnapshot {
    lines: Vec<Vec<TerminalCell>>,
    cursor_row: usize,
    cursor_col: usize,
    max_rows: usize,
    current_sgr: String,
}

impl TerminalDisplaySnapshot {
    fn new(max_rows: usize) -> Self {
        Self {
            lines: vec![Vec::new()],
            cursor_row: 0,
            cursor_col: 0,
            max_rows,
            current_sgr: String::new(),
        }
    }

    fn push(&mut self, value: &str) {
        let chars: Vec<char> = value.chars().collect();
        let mut index = 0;
        while index < chars.len() {
            match chars[index] {
                '\x1b' => {
                    index = self.consume_escape(&chars, index);
                }
                '\r' => {
                    self.cursor_col = 0;
                    index += 1;
                }
                '\n' => {
                    self.cursor_row += 1;
                    self.cursor_col = 0;
                    self.ensure_cursor_row();
                    index += 1;
                }
                '\x08' => {
                    self.cursor_col = self.cursor_col.saturating_sub(1);
                    index += 1;
                }
                '\t' => {
                    let spaces = 4 - (self.cursor_col % 4);
                    for _ in 0..spaces {
                        self.put_char(' ');
                    }
                    index += 1;
                }
                ch if ch.is_control() => {
                    index += 1;
                }
                ch => {
                    self.put_char(ch);
                    index += 1;
                }
            }
        }
    }

    fn text(&self) -> String {
        self.lines
            .iter()
            .map(|line| {
                line.iter()
                    .map(|cell| cell.ch)
                    .collect::<String>()
                    .trim_end()
                    .to_string()
            })
            .collect::<Vec<_>>()
            .join("\r\n")
            .trim()
            .to_string()
    }

    fn ansi_text(&self) -> String {
        let mut output_lines = Vec::new();
        for line in &self.lines {
            let end = line
                .iter()
                .rposition(|cell| !cell.ch.is_whitespace())
                .map(|idx| idx + 1)
                .unwrap_or(0);
            let mut current_sgr = String::new();
            let mut output = String::new();
            for cell in line.iter().take(end) {
                if cell.sgr != current_sgr {
                    output.push_str("\x1b[0m");
                    if !cell.sgr.is_empty() {
                        output.push_str("\x1b[");
                        output.push_str(&cell.sgr);
                        output.push('m');
                    }
                    current_sgr = cell.sgr.clone();
                }
                output.push(cell.ch);
            }
            if !current_sgr.is_empty() {
                output.push_str("\x1b[0m");
            }
            output_lines.push(output);
        }
        let mut output = output_lines.join("\r\n").trim().to_string();
        if !output.is_empty() {
            output.push_str("\x1b[0m");
            output.push_str(&format!(
                "\x1b[{};{}H",
                self.cursor_row + 1,
                self.cursor_col + 1
            ));
        }
        output
    }

    fn consume_escape(&mut self, chars: &[char], start: usize) -> usize {
        let Some(next) = chars.get(start + 1).copied() else {
            return start + 1;
        };
        if next == '[' {
            let mut cursor = start + 2;
            while cursor < chars.len() {
                let ch = chars[cursor];
                if ('@'..='~').contains(&ch) {
                    let params = chars[start + 2..cursor].iter().collect::<String>();
                    self.apply_csi(&params, ch);
                    return cursor + 1;
                }
                cursor += 1;
            }
            return chars.len();
        }
        if next == ']' {
            let mut cursor = start + 2;
            while cursor < chars.len() {
                if chars[cursor] == '\x07' {
                    return cursor + 1;
                }
                if chars[cursor] == '\x1b' && chars.get(cursor + 1) == Some(&'\\') {
                    return cursor + 2;
                }
                cursor += 1;
            }
            return chars.len();
        }
        start + 2
    }

    fn apply_csi(&mut self, params: &str, command: char) {
        let values = parse_csi_params(params);
        match command {
            'm' => self.apply_sgr(params),
            'H' | 'f' => {
                self.cursor_row = values.first().copied().unwrap_or(1).saturating_sub(1);
                self.cursor_col = values.get(1).copied().unwrap_or(1).saturating_sub(1);
                self.ensure_cursor_row();
            }
            'A' => {
                self.cursor_row = self
                    .cursor_row
                    .saturating_sub(values.first().copied().unwrap_or(1))
            }
            'B' => {
                self.cursor_row += values.first().copied().unwrap_or(1);
                self.ensure_cursor_row();
            }
            'C' => self.cursor_col += values.first().copied().unwrap_or(1),
            'D' => {
                self.cursor_col = self
                    .cursor_col
                    .saturating_sub(values.first().copied().unwrap_or(1))
            }
            'K' => self.erase_line(values.first().copied().unwrap_or(0)),
            'J' => self.erase_display(values.first().copied().unwrap_or(0)),
            _ => {}
        }
    }

    fn apply_sgr(&mut self, params: &str) {
        let mut parts = params.trim_start_matches('?').trim().to_string();
        if parts.is_empty() {
            parts = "0".to_string();
        }
        let codes = parts
            .split(';')
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>();
        if codes.iter().any(|code| *code == "0") {
            let after_reset = codes
                .iter()
                .rev()
                .take_while(|code| **code != "0")
                .copied()
                .collect::<Vec<_>>();
            self.current_sgr = after_reset.into_iter().rev().collect::<Vec<_>>().join(";");
            return;
        }
        if self.current_sgr.is_empty() {
            self.current_sgr = codes.join(";");
        } else if !codes.is_empty() {
            self.current_sgr.push(';');
            self.current_sgr.push_str(&codes.join(";"));
        }
    }

    fn erase_line(&mut self, mode: usize) {
        self.ensure_cursor_row();
        let line = &mut self.lines[self.cursor_row];
        match mode {
            1 => {
                let suffix = line
                    .iter()
                    .skip(self.cursor_col)
                    .cloned()
                    .collect::<Vec<_>>();
                let mut next = vec![TerminalCell::default(); self.cursor_col];
                next.extend(suffix);
                *line = next;
            }
            2 => line.clear(),
            _ => {
                line.truncate(self.cursor_col);
            }
        }
    }

    fn erase_display(&mut self, mode: usize) {
        match mode {
            2 => {
                self.lines.clear();
                self.lines.push(Vec::new());
                self.cursor_row = 0;
                self.cursor_col = 0;
            }
            _ => self.erase_line(0),
        }
    }

    fn put_char(&mut self, ch: char) {
        self.ensure_cursor_row();
        let line = &mut self.lines[self.cursor_row];
        while line.len() < self.cursor_col {
            line.push(TerminalCell::default());
        }
        let cell = TerminalCell {
            ch,
            sgr: self.current_sgr.clone(),
        };
        if self.cursor_col < line.len() {
            line[self.cursor_col] = cell;
        } else {
            line.push(cell);
        }
        self.cursor_col += 1;
    }

    fn ensure_cursor_row(&mut self) {
        while self.lines.len() <= self.cursor_row {
            self.lines.push(Vec::new());
        }
        if self.lines.len() > self.max_rows {
            let overflow = self.lines.len() - self.max_rows;
            self.lines.drain(0..overflow);
            self.cursor_row = self.cursor_row.saturating_sub(overflow);
        }
    }
}

fn parse_csi_params(params: &str) -> Vec<usize> {
    params
        .trim_start_matches('?')
        .split(';')
        .map(|part| part.trim().parse::<usize>().unwrap_or(0))
        .collect()
}

#[derive(Debug, Clone, Copy, Deserialize)]
struct TerminalRuntimeConfig {
    #[serde(default = "default_terminal_preview_bytes")]
    preview_bytes: usize,
    #[serde(default = "default_terminal_card_replay_bytes")]
    card_replay_bytes: u64,
    #[serde(default = "default_terminal_max_replay_bytes")]
    max_replay_bytes: u64,
    #[serde(default = "default_terminal_ring_buffer_bytes")]
    ring_buffer_bytes: usize,
}

fn default_terminal_preview_bytes() -> usize {
    SESSION_PREVIEW_LIMIT_BYTES
}

fn default_terminal_card_replay_bytes() -> u64 {
    TERMINAL_WS_REPLAY_CARD_LIMIT_BYTES
}

fn default_terminal_max_replay_bytes() -> u64 {
    TERMINAL_WS_REPLAY_MAX_LIMIT_BYTES
}

fn default_terminal_ring_buffer_bytes() -> usize {
    TERMINAL_RING_BUFFER_BYTES
}

impl Default for TerminalRuntimeConfig {
    fn default() -> Self {
        Self {
            preview_bytes: SESSION_PREVIEW_LIMIT_BYTES,
            card_replay_bytes: TERMINAL_WS_REPLAY_CARD_LIMIT_BYTES,
            max_replay_bytes: TERMINAL_WS_REPLAY_MAX_LIMIT_BYTES,
            ring_buffer_bytes: TERMINAL_RING_BUFFER_BYTES,
        }
    }
}

impl TerminalRuntimeConfig {
    fn normalized(self) -> Self {
        Self {
            preview_bytes: self
                .preview_bytes
                .clamp(512, TERMINAL_VOLATILE_BUFFER_MAX_BYTES),
            card_replay_bytes: self
                .card_replay_bytes
                .clamp(512, TERMINAL_VOLATILE_BUFFER_MAX_BYTES as u64),
            max_replay_bytes: self
                .max_replay_bytes
                .clamp(512, TERMINAL_VOLATILE_BUFFER_MAX_BYTES as u64),
            ring_buffer_bytes: self
                .ring_buffer_bytes
                .clamp(512, TERMINAL_VOLATILE_BUFFER_MAX_BYTES),
        }
    }
}

fn terminal_runtime_config_path() -> PathBuf {
    PathBuf::from(
        env::var(TERMINAL_RUNTIME_CONFIG_PATH_ENV)
            .unwrap_or_else(|_| TERMINAL_RUNTIME_CONFIG_DEFAULT_PATH.to_string()),
    )
}

fn terminal_runtime_config() -> TerminalRuntimeConfig {
    std::fs::read_to_string(terminal_runtime_config_path())
        .ok()
        .and_then(|text| serde_json::from_str::<TerminalRuntimeConfig>(&text).ok())
        .unwrap_or_default()
        .normalized()
}

fn tail_string_by_bytes(value: &str, max_bytes: usize) -> String {
    if max_bytes == 0 {
        return String::new();
    }
    if value.len() <= max_bytes {
        return value.to_string();
    }
    let mut start = value.len() - max_bytes;
    while !value.is_char_boundary(start) {
        start += 1;
    }
    strip_leading_partial_csi(&value[start..]).to_string()
}

fn strip_leading_partial_csi(value: &str) -> &str {
    if value.starts_with('\u{1b}') {
        return value;
    }
    let mut saw_param_or_intermediate = false;
    for (index, ch) in value.char_indices() {
        if ('0'..='?').contains(&ch) || (' '..='/').contains(&ch) {
            saw_param_or_intermediate = true;
            continue;
        }
        if saw_param_or_intermediate && ('@'..='~').contains(&ch) {
            return &value[index + ch.len_utf8()..];
        }
        break;
    }
    value
}

pub(crate) fn strip_ansi_for_ui(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut chars = strip_leading_partial_csi(value).chars();
    while let Some(ch) = chars.next() {
        if ch != '\u{1b}' {
            output.push(ch);
            continue;
        }
        match chars.next() {
            Some('[') => {
                for next in chars.by_ref() {
                    if ('@'..='~').contains(&next) {
                        break;
                    }
                }
            }
            Some(']') => {
                let mut saw_esc = false;
                for next in chars.by_ref() {
                    if next == '\u{7}' || (saw_esc && next == '\\') {
                        break;
                    }
                    saw_esc = next == '\u{1b}';
                }
            }
            Some(_) => {}
            None => break,
        }
    }
    output
}

fn terminal_preview_text_for_ui(preview: &str, max_bytes: usize) -> String {
    tail_string_by_bytes(&strip_ansi_for_ui(preview), max_bytes)
}

pub(crate) fn clamp_log_tail_limit(limit: Option<u64>) -> u64 {
    limit
        .unwrap_or(SESSION_LOG_VIEW_LIMIT_BYTES)
        .clamp(1, SESSION_LOG_MAX_TAIL_BYTES)
}

pub(crate) fn session_log_info_for_path(path: &PathBuf, tail_bytes: u64) -> SessionLogInfo {
    match std::fs::metadata(path) {
        Ok(metadata) => SessionLogInfo {
            path: path.display().to_string(),
            available: true,
            bytes: metadata.len(),
            tail_bytes: tail_bytes.min(metadata.len()),
            updated_at: metadata.modified().ok().map(DateTime::<Utc>::from),
        },
        Err(_) => SessionLogInfo {
            path: path.display().to_string(),
            available: false,
            bytes: 0,
            tail_bytes: 0,
            updated_at: None,
        },
    }
}

fn terminal_log_archive_dir() -> PathBuf {
    PathBuf::from("data").join("terminal-logs").join("archive")
}

fn terminal_context_ledger_path() -> PathBuf {
    PathBuf::from("data").join("terminal-context-ledger.jsonl")
}

pub(crate) fn terminal_persistent_logs_enabled() -> bool {
    matches!(
        env::var(TERMINAL_PERSIST_LOGS_ENV)
            .ok()
            .as_deref()
            .map(str::trim),
        Some("1") | Some("true") | Some("yes") | Some("on")
    )
}

fn rotate_terminal_log_if_needed(
    path: &PathBuf,
    session_id: &str,
) -> std::io::Result<Option<PathBuf>> {
    let Ok(metadata) = std::fs::metadata(path) else {
        return Ok(None);
    };
    if metadata.len() <= TERMINAL_LOG_ROTATE_BYTES {
        return Ok(None);
    }

    let archive_dir = terminal_log_archive_dir();
    std::fs::create_dir_all(&archive_dir)?;
    let timestamp = Utc::now().format("%Y%m%dT%H%M%SZ");
    let base_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("terminal.ansi.log");
    let archive_path = archive_dir.join(format!("{base_name}.{timestamp}.rotated"));
    std::fs::rename(path, &archive_path)?;
    append_terminal_context_event(
        session_id,
        "terminal_log_rotated",
        &archive_path,
        metadata.len(),
    );
    Ok(Some(archive_path))
}

fn append_terminal_context_event(
    session_id: &str,
    event: &str,
    archive_path: &PathBuf,
    bytes: u64,
) {
    let path = terminal_context_ledger_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let entry = json!({
        "at": Utc::now(),
        "sessionId": session_id,
        "event": event,
        "archivePath": archive_path.display().to_string(),
        "bytes": bytes,
        "policy": {
            "uiReplayBytes": TERMINAL_WS_REPLAY_MAX_LIMIT_BYTES,
            "cardReplayBytes": TERMINAL_WS_REPLAY_CARD_LIMIT_BYTES,
            "logViewBytes": SESSION_LOG_VIEW_LIMIT_BYTES,
            "logMaxTailBytes": SESSION_LOG_MAX_TAIL_BYTES,
            "rotateBytes": TERMINAL_LOG_ROTATE_BYTES,
            "flushIntervalMs": TERMINAL_LOG_FLUSH_INTERVAL_MS,
            "flushChunkBytes": TERMINAL_LOG_FLUSH_CHUNK_BYTES
        }
    });
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = writeln!(file, "{}", entry);
    }
}

struct TerminalLogWriter {
    file: Option<std::fs::File>,
    log_path: PathBuf,
    session_id: String,
    log_bytes: u64,
    pending: Vec<u8>,
    last_flush_at: Instant,
}

impl TerminalLogWriter {
    fn new(log_path: PathBuf, session_id: String) -> Self {
        let persist_logs = terminal_persistent_logs_enabled();
        let file = if persist_logs {
            if let Some(parent) = log_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = rotate_terminal_log_if_needed(&log_path, &session_id);
            std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_path)
                .ok()
        } else {
            append_terminal_context_event(&session_id, "terminal_log_volatile_mode", &log_path, 0);
            None
        };
        let log_bytes = std::fs::metadata(&log_path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        Self {
            file,
            log_path,
            session_id,
            log_bytes,
            pending: Vec::with_capacity(4096),
            last_flush_at: Instant::now(),
        }
    }

    fn write_session_banner(&mut self) {
        if let Some(file) = self.file.as_mut() {
            let _ = writeln!(
                file,
                "\r\n===== LCC session {} started at {} =====\r",
                self.session_id,
                Utc::now().to_rfc3339()
            );
            let _ = file.flush();
            self.log_bytes = std::fs::metadata(&self.log_path)
                .map(|metadata| metadata.len())
                .unwrap_or(self.log_bytes);
        }
    }

    fn push(&mut self, chunk: &[u8]) {
        if self.file.is_none() || chunk.is_empty() {
            return;
        }
        self.pending.extend_from_slice(chunk);
        if self.pending.len() >= TERMINAL_LOG_FLUSH_CHUNK_BYTES
            || self.last_flush_at.elapsed()
                >= StdDuration::from_millis(TERMINAL_LOG_FLUSH_INTERVAL_MS)
        {
            self.flush_pending();
        }
    }

    fn finish(&mut self) {
        self.flush_pending();
    }

    fn flush_pending(&mut self) {
        if self.pending.is_empty() {
            self.last_flush_at = Instant::now();
            return;
        }
        let Some(file) = self.file.as_mut() else {
            self.pending.clear();
            self.last_flush_at = Instant::now();
            return;
        };
        if file.write_all(&self.pending).is_ok() {
            let _ = file.flush();
            self.log_bytes = self.log_bytes.saturating_add(self.pending.len() as u64);
        }
        self.pending.clear();
        self.last_flush_at = Instant::now();
        if self.log_bytes > TERMINAL_LOG_ROTATE_BYTES {
            self.rotate();
        }
    }

    fn rotate(&mut self) {
        self.file.take();
        if rotate_terminal_log_if_needed(&self.log_path, &self.session_id).is_ok() {
            self.file = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&self.log_path)
                .ok();
            self.log_bytes = std::fs::metadata(&self.log_path)
                .map(|metadata| metadata.len())
                .unwrap_or(0);
            if let Some(next_file) = self.file.as_mut() {
                let _ = writeln!(
                    next_file,
                    "\r\n===== LCC session {} log rotated at {} =====\r",
                    self.session_id,
                    Utc::now().to_rfc3339()
                );
                let _ = next_file.flush();
                self.log_bytes = std::fs::metadata(&self.log_path)
                    .map(|metadata| metadata.len())
                    .unwrap_or(self.log_bytes);
            }
        }
    }
}

pub(crate) fn build_session_view(
    meta: SessionMeta,
    preview: String,
    source: SessionSource,
    attached: bool,
    interactive: bool,
    input_disabled_reason: Option<String>,
    log_path: PathBuf,
) -> SessionView {
    let preview_text = terminal_preview_text_for_ui(&preview, SESSION_PREVIEW_LIMIT_BYTES);
    build_session_view_with_preview_text(
        meta,
        preview,
        preview_text,
        source,
        attached,
        interactive,
        input_disabled_reason,
        log_path,
    )
}

fn build_session_view_with_preview_text(
    meta: SessionMeta,
    preview: String,
    preview_text: String,
    source: SessionSource,
    attached: bool,
    interactive: bool,
    input_disabled_reason: Option<String>,
    log_path: PathBuf,
) -> SessionView {
    let preview_has_ansi = preview_text != preview;
    SessionView {
        meta,
        preview,
        preview_text,
        preview_ansi: None,
        preview_has_ansi,
        display_snapshot_volatile: false,
        source: source.clone(),
        attached,
        interactive,
        input_disabled_reason,
        log: if matches!(source, SessionSource::Internal) && !terminal_persistent_logs_enabled() {
            SessionLogInfo {
                path: log_path.display().to_string(),
                available: false,
                bytes: 0,
                tail_bytes: 0,
                updated_at: None,
            }
        } else {
            session_log_info_for_path(&log_path, SESSION_LOG_VIEW_LIMIT_BYTES)
        },
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum SessionSource {
    Internal,
    Os,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SessionMeta {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) team: String,
    pub(crate) cwd: String,
    pub(crate) cmd: String,
    pub(crate) args: Vec<String>,
    pub(crate) model: Option<String>,
    pub(crate) status: SessionStatus,
    pub(crate) pid: Option<u32>,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
    pub(crate) exit_code: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum SessionStatus {
    Active,
    Exited,
    Error,
    Stopped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SessionView {
    #[serde(flatten)]
    pub(crate) meta: SessionMeta,
    pub(crate) preview: String,
    pub(crate) preview_text: String,
    pub(crate) preview_ansi: Option<String>,
    pub(crate) preview_has_ansi: bool,
    pub(crate) display_snapshot_volatile: bool,
    pub(crate) source: SessionSource,
    pub(crate) attached: bool,
    pub(crate) interactive: bool,
    pub(crate) input_disabled_reason: Option<String>,
    pub(crate) log: SessionLogInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SessionLogInfo {
    pub(crate) path: String,
    pub(crate) available: bool,
    pub(crate) bytes: u64,
    pub(crate) tail_bytes: u64,
    pub(crate) updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize, Default)]
pub(crate) struct SessionLogQuery {
    pub(crate) format: Option<String>,
    pub(crate) limit: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct SessionLogTailResponse {
    pub(crate) session_id: String,
    pub(crate) source: SessionSource,
    pub(crate) log: SessionLogInfo,
    pub(crate) tail: SessionLogTail,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct SessionLogTail {
    pub(crate) ansi: String,
    pub(crate) text: String,
    pub(crate) has_ansi: bool,
    pub(crate) truncated: bool,
    pub(crate) bytes: usize,
    pub(crate) text_bytes: usize,
    pub(crate) start_offset: u64,
    pub(crate) end_offset: u64,
}

#[derive(Debug, Clone)]
pub(crate) struct TailChunk {
    pub(crate) text: String,
    pub(crate) start: u64,
    pub(crate) end: u64,
    pub(crate) file_len: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct OsAgentRecord {
    id: String,
    name: String,
    team: String,
    cwd: String,
    cmd: String,
    args: Vec<String>,
    model: Option<String>,
    pid: Option<u32>,
    status: Option<String>,
    log_path: Option<String>,
    created_at: Option<DateTime<Utc>>,
    updated_at: Option<DateTime<Utc>>,
    attach_url: Option<String>,
    control_url: Option<String>,
    write_url: Option<String>,
    log_url: Option<String>,
    resize_url: Option<String>,
    runner_endpoint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub(crate) struct OsAgentAttachmentRecord {
    attached: bool,
    updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CreateSession {
    pub(crate) id: Option<String>,
    pub(crate) name: Option<String>,
    pub(crate) team: Option<String>,
    pub(crate) cwd: Option<String>,
    pub(crate) cmd: Option<String>,
    pub(crate) args: Option<Vec<String>>,
    pub(crate) model: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct WriteSession {
    pub(crate) input: Option<String>,
    pub(crate) data: Option<String>,
    pub(crate) prompt: Option<String>,
    pub(crate) repeat: Option<u8>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ResizeSession {
    pub(crate) cols: Option<u16>,
    pub(crate) rows: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum ServerEvent {
    Attached {
        session_id: String,
    },
    Replay {
        session_id: String,
        data: String,
    },
    SessionCreated {
        session: SessionView,
    },
    SessionDeleted {
        session_id: String,
    },
    Output {
        session_id: String,
        source: String,
        data: String,
    },
    Input {
        session_id: String,
        data: String,
    },
    Exit {
        session_id: String,
        code: Option<i32>,
    },
    Error {
        session_id: Option<String>,
        message: String,
    },
}

type Canvas = DomainCanvas;
type CanvasSection = DomainCanvasSection;
type CanvasMessage = DomainCanvasMessage;
type PeerMessage = DomainPeerMessage;
type MemoryEntry = DomainMemoryEntry;

#[derive(Debug, Deserialize)]
struct CreateCanvas {
    id: Option<String>,
    title: Option<String>,
    owner: Option<String>,
    canvas_type: Option<String>,
    members: Option<Vec<String>>,
    linked_issues: Option<Vec<String>>,
    linked_meetings: Option<Vec<String>>,
    content: Option<Vec<CanvasSection>>,
}

#[derive(Debug, Deserialize)]
struct AddMessage {
    author: Option<String>,
    body: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct InviteMember {
    member: Option<String>,
    agent: Option<String>,
}

#[derive(Clone)]
struct CanvasStore {
    path: Arc<PathBuf>,
    canvases: Arc<RwLock<Vec<Canvas>>>,
}

#[derive(Clone)]
struct PeerStore {
    path: Arc<PathBuf>,
    messages: Arc<RwLock<Vec<PeerMessage>>>,
}

#[derive(Clone)]
struct MemoryStore {
    path: Arc<PathBuf>,
    entries: Arc<RwLock<Vec<MemoryEntry>>>,
}

#[derive(Clone)]
struct DailyMemoryStore {
    dir: Arc<PathBuf>,
}

#[derive(Debug, Deserialize)]
struct AppendDailyMemoryCheckpoint {
    heading: Option<String>,
    content: Option<String>,
    source: Option<String>,
    tags: Option<Vec<String>>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter("lcc_core_api=debug,tower_http=info,axum=info")
        .init();

    let (tx, _) = broadcast::channel(64);
    let storage_path =
        env::var("LCC_STORAGE_PATH").unwrap_or_else(|_| "data/canvases.json".to_string());
    let canvas_store = CanvasStore::new(PathBuf::from(storage_path)).await?;
    let peer_storage_path =
        env::var("LCC_PEER_STORAGE_PATH").unwrap_or_else(|_| "data/peer-bridge.jsonl".to_string());
    let peer_store = PeerStore::new(PathBuf::from(peer_storage_path)).await?;
    let work_ledger_path =
        env::var("LCC_WORK_LEDGER_PATH").unwrap_or_else(|_| "data/work-ledger.json".to_string());
    let work_ledger = WorkLedgerStore::new(PathBuf::from(work_ledger_path)).await?;
    let memory_path =
        env::var("LCC_MEMORY_PATH").unwrap_or_else(|_| "data/memory-ledger.jsonl".to_string());
    let memory_store = MemoryStore::new(PathBuf::from(memory_path)).await?;
    let daily_memory_dir =
        env::var("LCC_DAILY_MEMORY_DIR").unwrap_or_else(|_| "data/daily-memory".to_string());
    let daily_memory_store = DailyMemoryStore::new(PathBuf::from(daily_memory_dir)).await?;
    let state = AppState {
        sessions: Arc::new(RwLock::new(HashMap::new())),
        terminal_buffers: Arc::new(StdMutex::new(HashMap::new())),
        terminal_display_snapshots: Arc::new(StdMutex::new(HashMap::new())),
        terminal_last_nonempty_snapshots: Arc::new(StdMutex::new(HashMap::new())),
        tx,
        canvas_store,
        peer_store,
        work_ledger,
        memory_store,
        daily_memory_store,
    };

    let inbound_only = env::var("LCC_INBOUND_ONLY")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let serve_web = env::var("LCC_SERVE_WEB")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let route = if inbound_only {
        Router::new()
            .route("/api/branch/health", get(api::branch::branch_health))
            .route("/api/branch/status", get(api::branch::branch_status))
            .route("/api/branch/agents", get(api::branch::branch_agents))
            .route(
                "/api/branch/work-ledger",
                get(api::branch::branch_work_ledger),
            )
            .route(
                "/api/branch/messages",
                get(api::branch::branch_list_messages).post(api::branch::branch_add_message),
            )
            .route(
                "/api/branch/files/read",
                get(api::branch_files::branch_file_read),
            )
            .route(
                "/api/branch/files/list",
                get(api::branch_files::branch_file_list),
            )
            .route(
                "/api/branch/files/diff",
                get(api::branch_files::branch_file_diff),
            )
            .route(
                "/api/branch/git/log",
                get(api::branch_files::branch_git_log),
            )
    } else {
        let api_route = Router::new()
            .route("/api/health", get(api::health::health))
            .route(
                "/api/sessions",
                get(api::session::list_sessions).post(api::session::create_session),
            )
            .route("/api/sessions/active", get(api::session::list_sessions))
            .route("/api/sessions/pty-stats", get(api::session::pty_stats))
            .route(
                "/api/sessions/:id",
                get(api::session::get_session).delete(api::session::delete_session),
            )
            .route("/api/sessions/:id/log", get(api::session::get_session_log))
            .route("/api/sessions/:id/write", post(api::session::write_session))
            .route(
                "/api/sessions/:id/prompt-text",
                post(api::session::write_session_prompt_text),
            )
            .route(
                "/api/sessions/:id/prompt-submit",
                post(api::session::write_session_prompt_submit),
            )
            .route(
                "/api/sessions/:id/resize",
                post(api::session::resize_session),
            )
            .route("/api/os-agents", get(api::os_agent::list_os_agents))
            .route(
                "/api/os-agents/:id/attach",
                post(api::os_agent::attach_os_agent),
            )
            .route(
                "/api/os-agents/:id/detach",
                post(api::os_agent::detach_os_agent),
            )
            .route("/ws/terminal", get(api::terminal::terminal_ws))
            .route("/api/peer/status", get(api::peer::peer_status))
            .route(
                "/api/peer/messages",
                get(api::peer::list_peer_messages).post(api::peer::add_peer_message),
            )
            .route("/api/work-ledger", get(api::work_ledger::get_work_ledger))
            .route(
                "/api/work-ledger/tasks/:id",
                put(api::work_ledger::upsert_work_task),
            )
            .route(
                "/api/work-ledger/tasks/:id/events",
                post(api::work_ledger::add_work_task_event),
            )
            .route(
                "/api/memory",
                get(api::memory::list_memory).post(api::memory::add_memory),
            )
            .route(
                "/api/memory/recover/:agent_id",
                get(api::memory::recover_agent_context),
            )
            .route(
                "/api/daily-memory/today",
                get(api::daily_memory::get_today_daily_memory),
            )
            .route(
                "/api/daily-memory/:date",
                get(api::daily_memory::get_daily_memory),
            )
            .route(
                "/api/daily-memory/:date/checkpoints",
                post(api::daily_memory::append_daily_memory_checkpoint),
            )
            .route(
                "/api/canvases",
                get(api::canvas::list_canvases).post(api::canvas::create_canvas),
            )
            .route(
                "/api/canvases/:id",
                get(api::canvas::get_canvas).patch(api::canvas::update_canvas),
            )
            .route(
                "/api/canvases/:id/content",
                get(api::canvas::get_content)
                    .put(api::canvas::put_content)
                    .patch(api::canvas::put_content),
            )
            .route(
                "/api/canvases/:id/messages",
                get(api::canvas::get_messages).post(api::canvas::add_message),
            )
            .route("/api/canvases/:id/invite", post(api::canvas::invite_member))
            .route("/api/branch/health", get(api::branch::branch_health))
            .route("/api/branch/status", get(api::branch::branch_status))
            .route("/api/branch/agents", get(api::branch::branch_agents))
            .route(
                "/api/branch/work-ledger",
                get(api::branch::branch_work_ledger),
            )
            .route(
                "/api/branch/messages",
                get(api::branch::branch_list_messages).post(api::branch::branch_add_message),
            )
            .route(
                "/api/branch/files/read",
                get(api::branch_files::branch_file_read),
            )
            .route(
                "/api/branch/files/list",
                get(api::branch_files::branch_file_list),
            )
            .route(
                "/api/branch/files/diff",
                get(api::branch_files::branch_file_diff),
            )
            .route(
                "/api/branch/git/log",
                get(api::branch_files::branch_git_log),
            );

        if serve_web {
            api_route.nest_service(
                "/",
                ServeDir::new("apps/web/dist").fallback(ServeDir::new("apps/web")),
            )
        } else {
            api_route
        }
    };

    let app = if inbound_only {
        route.layer(TraceLayer::new_for_http()).with_state(state)
    } else {
        route
            .layer(CorsLayer::permissive())
            .layer(TraceLayer::new_for_http())
            .with_state(state)
    };

    let host = env::var("LCC_API_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("LCC_API_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(9001);
    let addr: SocketAddr = format!("{host}:{port}")
        .parse()
        .expect("LCC_API_HOST/LCC_API_PORT must form a valid socket address");
    tracing::info!("LCC Core API listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct BranchAgentView {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) team: String,
    pub(crate) status: String,
    pub(crate) pid: Option<u32>,
    pub(crate) source: String,
    pub(crate) attached: Option<bool>,
    pub(crate) interactive: Option<bool>,
    pub(crate) last_activity_at: Option<DateTime<Utc>>,
    pub(crate) last_activity_age_seconds: i64,
    pub(crate) log_updated_at: Option<DateTime<Utc>>,
    pub(crate) preview: String,
    pub(crate) input_disabled_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct BranchSessionApiState {
    pub(crate) ok: bool,
    pub(crate) source: String,
    pub(crate) note: String,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct BranchAgentCensus {
    pub(crate) ok: bool,
    pub(crate) service: String,
    pub(crate) time: DateTime<Utc>,
    pub(crate) total_agents: usize,
    pub(crate) active_agents: usize,
    pub(crate) attached_agents: usize,
    pub(crate) interactive_agents: usize,
    pub(crate) session_source: String,
    pub(crate) session_api: BranchSessionApiState,
    pub(crate) agents: Vec<BranchAgentView>,
}

fn require_branch_token(headers: &HeaderMap) -> Result<(), ApiError> {
    let expected = match env::var("LCC_BRANCH_INBOUND_TOKEN")
        .ok()
        .filter(|value| !value.trim().is_empty())
    {
        Some(t) => t,
        None => return Ok(()), // token not configured — local/dev access allowed
    };
    let provided = headers
        .get("X-LCC-Token")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if provided == expected {
        Ok(())
    } else {
        Err(ApiError::unauthorized("invalid branch inbound token"))
    }
}

#[derive(Debug, Clone, Deserialize)]
struct BranchAgentSnapshotSession {
    id: String,
    name: Option<String>,
    team: Option<String>,
    status: Option<String>,
    updated_at: Option<DateTime<Utc>>,
    preview_hash: Option<String>,
    observed_state: Option<String>,
    #[serde(rename = "signals")]
    _signals: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
struct BranchAgentSnapshot {
    generated_at: Option<DateTime<Utc>>,
    source: Option<String>,
    #[serde(rename = "counts")]
    _counts: Value,
    sessions: Vec<BranchAgentSnapshotSession>,
}

pub(crate) async fn collect_branch_agent_census(state: &AppState) -> BranchAgentCensus {
    let inbound_only = env::var("LCC_INBOUND_ONLY")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    if !inbound_only {
        let sessions = api::session::list_sessions(State(state.clone())).await.0;
        return branch_agent_census_from_sessions(
            "local-state".to_string(),
            BranchSessionApiState {
                ok: true,
                source: "local-state".to_string(),
                note: "served from current API process session state".to_string(),
            },
            sessions,
        );
    }

    match fetch_branch_sessions_via_local_api().await {
        Ok(sessions) => branch_agent_census_from_sessions(
            "live-9001-api".to_string(),
            BranchSessionApiState {
                ok: true,
                source: "live-9001-api".to_string(),
                note: branch_session_api_url(),
            },
            sessions,
        ),
        Err(live_error) => match read_branch_agent_snapshot_file().await {
            Ok(snapshot) => branch_agent_census_from_snapshot(snapshot, live_error),
            Err(snapshot_error) => BranchAgentCensus {
                ok: false,
                service: "lcc-core-branch-inbound".to_string(),
                time: Utc::now(),
                total_agents: 0,
                active_agents: 0,
                attached_agents: 0,
                interactive_agents: 0,
                session_source: "unavailable".to_string(),
                session_api: BranchSessionApiState {
                    ok: false,
                    source: "unavailable".to_string(),
                    note: format!("live={live_error}; snapshot={snapshot_error}"),
                },
                agents: Vec::new(),
            },
        },
    }
}

fn branch_agent_census_from_sessions(
    source: String,
    session_api: BranchSessionApiState,
    sessions: Vec<SessionView>,
) -> BranchAgentCensus {
    let now = Utc::now();
    let mut active_agents = 0usize;
    let mut attached_agents = 0usize;
    let mut interactive_agents = 0usize;
    let agents = sessions
        .into_iter()
        .map(|session| {
            if matches!(session.meta.status, SessionStatus::Active) {
                active_agents += 1;
            }
            if session.attached {
                attached_agents += 1;
            }
            if session.interactive {
                interactive_agents += 1;
            }
            BranchAgentView {
                id: session.meta.id,
                name: session.meta.name,
                team: session.meta.team,
                status: session_status_label(&session.meta.status).to_string(),
                pid: session.meta.pid,
                source: session_source_label(&session.source).to_string(),
                attached: Some(session.attached),
                interactive: Some(session.interactive),
                last_activity_at: Some(session.meta.updated_at),
                last_activity_age_seconds: now
                    .signed_duration_since(session.meta.updated_at)
                    .num_seconds()
                    .max(0),
                log_updated_at: session.log.updated_at,
                preview: compact_branch_preview(&session.preview_text),
                input_disabled_reason: session.input_disabled_reason,
            }
        })
        .collect::<Vec<_>>();

    BranchAgentCensus {
        ok: true,
        service: "lcc-core-branch-inbound".to_string(),
        time: now,
        total_agents: agents.len(),
        active_agents,
        attached_agents,
        interactive_agents,
        session_source: source,
        session_api,
        agents,
    }
}

fn branch_agent_census_from_snapshot(
    snapshot: BranchAgentSnapshot,
    live_error: String,
) -> BranchAgentCensus {
    let now = Utc::now();
    let agents = snapshot
        .sessions
        .into_iter()
        .map(|session| {
            let last_activity_at = session.updated_at.or(snapshot.generated_at).or(Some(now));
            BranchAgentView {
                id: session.id,
                name: session.name.unwrap_or_else(|| "-".to_string()),
                team: session.team.unwrap_or_else(|| "-".to_string()),
                status: session.status.unwrap_or_else(|| "active".to_string()),
                pid: None,
                source: snapshot
                    .source
                    .clone()
                    .unwrap_or_else(|| "snapshot-file".to_string()),
                attached: None,
                interactive: None,
                last_activity_at,
                last_activity_age_seconds: last_activity_at
                    .map(|at| now.signed_duration_since(at).num_seconds().max(0))
                    .unwrap_or_default(),
                log_updated_at: None,
                preview: session.preview_hash.unwrap_or_default(),
                input_disabled_reason: session.observed_state,
            }
        })
        .collect::<Vec<_>>();
    let active_agents = agents
        .iter()
        .filter(|agent| {
            !matches!(
                agent.status.as_str(),
                "exited" | "error" | "stopped" | "inactive"
            )
        })
        .count();

    BranchAgentCensus {
        ok: true,
        service: "lcc-core-branch-inbound".to_string(),
        time: snapshot.generated_at.unwrap_or(now),
        total_agents: agents.len(),
        active_agents,
        attached_agents: 0,
        interactive_agents: 0,
        session_source: snapshot
            .source
            .unwrap_or_else(|| "snapshot-file".to_string()),
        session_api: BranchSessionApiState {
            ok: false,
            source: "snapshot-file".to_string(),
            note: format!("live session api unavailable: {live_error}"),
        },
        agents,
    }
}

fn compact_branch_preview(value: &str) -> String {
    let compact = value
        .replace('\r', " ")
        .replace('\n', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let max_chars = 240usize;
    if compact.chars().count() <= max_chars {
        compact
    } else {
        compact.chars().take(max_chars).collect::<String>()
    }
}

fn session_status_label(status: &SessionStatus) -> &'static str {
    match status {
        SessionStatus::Active => "active",
        SessionStatus::Exited => "exited",
        SessionStatus::Error => "error",
        SessionStatus::Stopped => "stopped",
    }
}

fn session_source_label(source: &SessionSource) -> &'static str {
    match source {
        SessionSource::Internal => "internal",
        SessionSource::Os => "os",
    }
}

fn branch_session_api_url() -> String {
    env::var("LCC_BRANCH_SESSION_API")
        .unwrap_or_else(|_| "http://127.0.0.1:9001/api/sessions".to_string())
}

fn branch_agent_snapshot_path() -> PathBuf {
    PathBuf::from(
        env::var("LCC_AGENT_STATUS_SNAPSHOT_PATH")
            .unwrap_or_else(|_| "data/agent-status-latest.json".to_string()),
    )
}

async fn fetch_branch_sessions_via_local_api() -> Result<Vec<SessionView>, String> {
    let url = branch_session_api_url();
    let (host, port, path) = parse_http_url(&url)?;
    let mut stream = TcpStream::connect((host.as_str(), port))
        .await
        .map_err(|err| format!("connect failed: {err}"))?;
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nConnection: close\r\nAccept: application/json\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|err| format!("write failed: {err}"))?;
    let mut bytes = Vec::new();
    stream
        .read_to_end(&mut bytes)
        .await
        .map_err(|err| format!("read failed: {err}"))?;
    let response = String::from_utf8_lossy(&bytes).to_string();
    let (head, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| "malformed http response".to_string())?;
    let status_line = head.lines().next().unwrap_or_default().to_string();
    if !status_line.contains(" 200 ") {
        return Err(format!("upstream status not ok: {status_line}"));
    }
    serde_json::from_str::<Vec<SessionView>>(body)
        .map_err(|err| format!("session decode failed: {err}"))
}

fn parse_http_url(url: &str) -> Result<(String, u16, String), String> {
    let stripped = url
        .strip_prefix("http://")
        .ok_or_else(|| "only http:// URLs are supported".to_string())?;
    let (host_port, path) = match stripped.split_once('/') {
        Some((host_port, rest)) => (host_port, format!("/{}", rest)),
        None => (stripped, "/".to_string()),
    };
    let (host, port) = match host_port.split_once(':') {
        Some((host, port)) => {
            let port = port
                .parse::<u16>()
                .map_err(|_| "invalid port in branch session api url".to_string())?;
            (host.to_string(), port)
        }
        None => (host_port.to_string(), 80u16),
    };
    if host.trim().is_empty() {
        return Err("missing host in branch session api url".to_string());
    }
    Ok((host, port, path))
}

async fn read_branch_agent_snapshot_file() -> Result<BranchAgentSnapshot, String> {
    let path = branch_agent_snapshot_path();
    let raw = fs::read_to_string(&path)
        .await
        .map_err(|err| format!("snapshot read failed: {err}"))?;
    serde_json::from_str::<BranchAgentSnapshot>(&raw)
        .map_err(|err| format!("snapshot decode failed: {err}"))
}

async fn read_tail_lossy(path: PathBuf, max_bytes: u64) -> std::io::Result<String> {
    Ok(read_tail_chunk(path, max_bytes).await?.text)
}

async fn read_tail_lossy_or_empty(path: PathBuf, max_bytes: u64) -> std::io::Result<String> {
    match read_tail_lossy(path, max_bytes).await {
        Ok(text) => Ok(text),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(err) => Err(err),
    }
}

pub(crate) async fn read_tail_chunk(path: PathBuf, max_bytes: u64) -> std::io::Result<TailChunk> {
    let mut file = fs::File::open(path).await?;
    let len = file.metadata().await?.len();
    let start = len.saturating_sub(max_bytes);
    file.seek(SeekFrom::Start(start)).await?;
    let mut bytes = Vec::with_capacity((len - start).min(max_bytes) as usize);
    file.read_to_end(&mut bytes).await?;
    Ok(TailChunk {
        text: String::from_utf8_lossy(&bytes).to_string(),
        start,
        end: len,
        file_len: len,
    })
}

pub(crate) fn event_session_id(event: &ServerEvent) -> Option<&str> {
    match event {
        ServerEvent::Attached { session_id }
        | ServerEvent::Replay { session_id, .. }
        | ServerEvent::SessionDeleted { session_id }
        | ServerEvent::Output { session_id, .. }
        | ServerEvent::Input { session_id, .. }
        | ServerEvent::Exit { session_id, .. } => Some(session_id),
        ServerEvent::SessionCreated { .. }
        | ServerEvent::Error {
            session_id: None, ..
        } => None,
        ServerEvent::Error {
            session_id: Some(session_id),
            ..
        } => Some(session_id),
    }
}

pub(crate) fn terminal_current_display_for_attach(state: &AppState, id: &str) -> Option<String> {
    terminal_display_snapshot_ansi_text(state, id)
        .filter(|s| !s.trim().is_empty())
        .map(|snapshot| format!("{TERMINAL_ATTACH_CLEAR_PREFIX}{snapshot}"))
        .or_else(|| terminal_display_snapshot_text(state, id))
        .or_else(|| {
            // Smart fallback: ring buffer의 마지막 ESC[2J(clear-screen) 이후 내용만 전송.
            // buffer_tail 전체 전송 시 누적된 CRLF ghost가 같이 오므로, 마지막 화면 갱신
            // 이전 내용은 버리고 clear+redraw 결과만 클라이언트에 제공한다.
            let tail = terminal_buffer_tail(state, id, terminal_runtime_config().preview_bytes)?;
            if let Some(pos) = tail.rfind("\x1b[2J") {
                let from_clear = &tail[pos..];
                Some(from_clear.to_string())
            } else {
                // ESC[2J 없음 → CLEAR_PREFIX + 마지막 2048바이트 전송.
                // CLEAR_PREFIX가 화면을 먼저 클리어하므로 ghost 재발 없이 최신 출력 표시.
                Some(format!(
                    "{TERMINAL_ATTACH_CLEAR_PREFIX}{}",
                    &tail[tail.len().saturating_sub(2048)..]
                ))
            }
        })
        .filter(|text| !text.is_empty())
}

fn parse_attach_terminal_dims(value: &Value) -> Option<(u16, u16)> {
    let cols = value
        .get("cols")
        .and_then(Value::as_u64)
        .map(|cols| cols.clamp(20, 300) as u16);
    let rows = value
        .get("rows")
        .and_then(Value::as_u64)
        .map(|rows| rows.clamp(5, 120) as u16);
    match (cols, rows) {
        (Some(cols), Some(rows)) => Some((cols, rows)),
        _ => None,
    }
}

pub(crate) async fn apply_attach_terminal_dims(
    state: &AppState,
    session_id: &str,
    value: &Value,
) -> Result<(), ApiError> {
    let Some((cols, rows)) = parse_attach_terminal_dims(value) else {
        return Ok(());
    };
    let is_internal_session = state.sessions.read().await.contains_key(session_id);
    if !is_internal_session {
        return Ok(());
    }
    resize_to_session(state, session_id, cols, rows)
        .await
        .map(|_| ())
}

pub(crate) async fn handle_terminal_protocol(state: &AppState, raw: &str) -> Option<Value> {
    let value = serde_json::from_str::<Value>(raw).ok()?;
    let kind = value.get("type")?.as_str()?;
    let session_id = value
        .get("sessionId")
        .or_else(|| value.get("session_id"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    match kind {
        "attach" => {
            let runtime_config = terminal_runtime_config();
            let replay_limit_bytes = value
                .get("replayBytes")
                .or_else(|| value.get("replay_bytes"))
                .and_then(Value::as_u64)
                .unwrap_or(runtime_config.card_replay_bytes)
                .clamp(512, runtime_config.max_replay_bytes);
            if let Err(err) = apply_attach_terminal_dims(state, &session_id, &value).await {
                return Some(
                    json!({ "type": "error", "sessionId": session_id, "message": err.message }),
                );
            }
            let replay = match resolve_terminal_replay(state, &session_id, replay_limit_bytes).await
            {
                Ok(replay) => replay,
                Err(err) => {
                    return Some(
                        json!({ "type": "error", "sessionId": session_id, "message": err.message }),
                    )
                }
            };
            Some(json!({ "type": "replay", "sessionId": session_id, "data": replay }))
        }
        "input" => {
            let data = value
                .get("data")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            match write_raw_to_session(state, &session_id, data).await {
                Ok(_) => None,
                Err(err) => Some(
                    json!({ "type": "error", "sessionId": session_id, "message": err.message }),
                ),
            }
        }
        "sendPrompt" => {
            let prompt = value
                .get("prompt")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            match write_to_session(state, &session_id, prompt).await {
                Ok(_) => Some(json!({
                    "type": "promptAck",
                    "sessionId": session_id,
                    "ok": true,
                    "submitKey": "\\r"
                })),
                Err(err) => Some(
                    json!({ "type": "error", "sessionId": session_id, "message": err.message }),
                ),
            }
        }
        "promptText" => {
            let body = prompt_body_from_ws_value(&value);
            match write_prompt_text_to_session(state, &session_id, body.clone()).await {
                Ok(_) => Some(json!({
                    "type": "promptTextAck",
                    "sessionId": session_id,
                    "ok": true,
                    "textBytes": body.as_bytes().len(),
                    "lineCount": prompt_line_count(&body)
                })),
                Err(err) => Some(
                    json!({ "type": "error", "sessionId": session_id, "message": err.message }),
                ),
            }
        }
        "promptSubmit" => {
            let repeat = value
                .get("repeat")
                .and_then(Value::as_u64)
                .unwrap_or(1)
                .clamp(1, 2) as u8;
            match write_prompt_submit_to_session(state, &session_id, repeat).await {
                Ok(_) => Some(json!({
                    "type": "promptSubmitAck",
                    "sessionId": session_id,
                    "ok": true,
                    "submitKey": "\\r",
                    "repeat": repeat
                })),
                Err(err) => Some(
                    json!({ "type": "error", "sessionId": session_id, "message": err.message }),
                ),
            }
        }
        "resize" => {
            let cols = value
                .get("cols")
                .and_then(Value::as_u64)
                .unwrap_or(120)
                .clamp(20, 300) as u16;
            let rows = value
                .get("rows")
                .and_then(Value::as_u64)
                .unwrap_or(30)
                .clamp(5, 120) as u16;
            match resize_to_session(state, &session_id, cols, rows).await {
                Ok(_) => Some(
                    json!({ "type": "resized", "sessionId": session_id, "ok": true, "cols": cols, "rows": rows }),
                ),
                Err(err) => Some(
                    json!({ "type": "error", "sessionId": session_id, "message": err.message }),
                ),
            }
        }
        _ => Some(
            json!({ "type": "error", "sessionId": session_id, "message": "unknown terminal protocol message" }),
        ),
    }
}

pub(crate) async fn resize_to_session(
    state: &AppState,
    id: &str,
    cols: u16,
    rows: u16,
) -> Result<SessionView, ApiError> {
    let Some(session) = state.sessions.read().await.get(id).cloned() else {
        if let Some(record) = read_os_agent_record(id).await {
            let attached = os_agent_is_attached(&record).await;
            if !attached {
                return Err(ApiError::conflict("OS agent is detached from this API"));
            }
            return Err(ApiError::bad_request(format!(
                "OS agent resize is not supported by this runner-backed session (cols={cols}, rows={rows})"
            )));
        }
        return Err(ApiError::not_found("session not found"));
    };
    let mut session = session.lock().await;
    session
        ._master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(ApiError::internal)?;
    session.touch();
    let meta = session.meta.clone();
    drop(session);
    build_internal_session_view(state, meta).await
}

pub(crate) async fn write_to_session(
    state: &AppState,
    id: &str,
    data: String,
) -> Result<SessionView, ApiError> {
    let body = normalize_prompt_body(&data);
    let session = write_prompt_text_to_session(state, id, body).await?;
    sleep(Duration::from_millis(300)).await;
    if session.meta.status == SessionStatus::Exited {
        return Ok(session);
    }
    write_prompt_submit_to_session(state, id, 1).await
}

pub(crate) fn prompt_body_from_write_session(input: &WriteSession) -> String {
    let data = input
        .input
        .clone()
        .or_else(|| input.data.clone())
        .or_else(|| input.prompt.clone())
        .unwrap_or_default();
    normalize_prompt_body(&data)
}

fn prompt_body_from_ws_value(value: &Value) -> String {
    let prompt = value
        .get("prompt")
        .or_else(|| value.get("data"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    normalize_prompt_body(&prompt)
}

pub(crate) async fn write_prompt_text_to_session(
    state: &AppState,
    id: &str,
    body: String,
) -> Result<SessionView, ApiError> {
    if body.is_empty() {
        return resolve_session_view(state, id).await;
    }
    let session = write_session_bytes(state, id, body, true).await?;
    sleep(Duration::from_millis(PROMPT_TEXT_FLUSH_DELAY_MS)).await;
    Ok(session)
}

pub(crate) async fn write_prompt_submit_to_session(
    state: &AppState,
    id: &str,
    repeat: u8,
) -> Result<SessionView, ApiError> {
    let repeat = repeat.clamp(1, 2);
    let mut session = write_session_bytes(state, id, prompt_submit_key().to_string(), true).await?;
    for _ in 1..repeat {
        sleep(Duration::from_millis(120)).await;
        session = write_session_bytes(state, id, prompt_submit_key().to_string(), true).await?;
    }
    Ok(session)
}

fn normalize_prompt_body(data: &str) -> String {
    let mut normalized = data.replace("\r\n", "\n").replace('\r', "\n");
    while normalized.ends_with('\n') {
        normalized.pop();
    }
    normalized
}

pub(crate) fn prompt_line_count(data: &str) -> usize {
    if data.is_empty() {
        0
    } else {
        data.split('\n').count()
    }
}

fn prompt_submit_key() -> &'static str {
    "\r"
}

#[cfg_attr(not(test), allow(dead_code))]
fn normalize_pty_output(data: &str) -> String {
    let mut normalizer = TerminalOutputNormalizer::default();
    let mut normalized = normalizer.normalize(data);
    let trailing_escape = normalizer.finish();
    if !trailing_escape.is_empty() {
        normalized.push_str(&trailing_escape);
    }
    normalized
}

fn append_terminal_output(state: &AppState, id: &str, data: String) {
    if data.is_empty() {
        return;
    }
    if let Ok(mut buffers) = state.terminal_buffers.lock() {
        let ring_buffer_bytes = terminal_runtime_config().ring_buffer_bytes;
        buffers
            .entry(id.to_string())
            .or_insert_with(|| TerminalRingBuffer::new(ring_buffer_bytes))
            .set_max_bytes(ring_buffer_bytes);
        buffers
            .entry(id.to_string())
            .or_insert_with(|| TerminalRingBuffer::new(ring_buffer_bytes))
            .push(&data);
    }
    let snapshot_text_after_push =
        if let Ok(mut snapshots) = state.terminal_display_snapshots.lock() {
            snapshots
                .entry(id.to_string())
                .or_insert_with(|| TerminalDisplaySnapshot::new(150))
                .push(&data);
            snapshots.get(id).map(TerminalDisplaySnapshot::text)
        } else {
            None
        };
    // Cache last non-empty snapshot text for P1-G fallback (ESC[2J redraw window stability).
    if let Some(text) = snapshot_text_after_push {
        if !text.is_empty() {
            if let Ok(mut last_nonempty) = state.terminal_last_nonempty_snapshots.lock() {
                last_nonempty.insert(id.to_string(), text);
            }
        }
    }
    let _ = state.tx.send(ServerEvent::Output {
        session_id: id.to_string(),
        source: "pty".to_string(),
        data,
    });
}

#[cfg(test)]
mod tests {
    use axum::http::StatusCode;
    use serde_json::json;
    use std::{
        env, fs as stdfs,
        path::PathBuf,
        time::{Duration as StdDuration, Instant},
    };

    use super::{
        normalize_prompt_body, normalize_pty_output, prompt_body_from_write_session,
        prompt_body_from_ws_value, prompt_submit_key, read_tail_lossy, strip_ansi_for_ui,
        tail_string_by_bytes, terminal_preview_text_for_ui, PtyOutputProcessor, WriteSession,
    };
    use crate::app::work_ledger::normalize_work_event_kind;

    fn encode_prompt_submit_for_test(data: &str) -> String {
        format!("{}{}", normalize_prompt_body(data), prompt_submit_key())
    }

    #[test]
    fn prompt_submit_adds_enter_when_missing() {
        assert_eq!(encode_prompt_submit_for_test("hello"), "hello\r");
    }

    #[test]
    fn prompt_submit_collapses_trailing_newlines_to_single_enter() {
        assert_eq!(encode_prompt_submit_for_test("hello\r\n"), "hello\r");
        assert_eq!(encode_prompt_submit_for_test("hello\n\n"), "hello\r");
        assert_eq!(encode_prompt_submit_for_test("hello\r\r"), "hello\r");
    }

    #[test]
    fn prompt_submit_preserves_multiline_body_before_submit() {
        assert_eq!(
            encode_prompt_submit_for_test("line 1\r\nline 2"),
            "line 1\nline 2\r"
        );
        assert_eq!(
            encode_prompt_submit_for_test("line 1\rline 2\n"),
            "line 1\nline 2\r"
        );
    }

    #[test]
    fn prompt_submit_handles_empty_or_only_newlines_as_submit_only() {
        assert_eq!(encode_prompt_submit_for_test(""), "\r");
        assert_eq!(encode_prompt_submit_for_test("\n"), "\r");
        assert_eq!(encode_prompt_submit_for_test("\r\n\r\n"), "\r");
    }

    #[test]
    fn prompt_submit_preserves_internal_blank_lines() {
        assert_eq!(
            encode_prompt_submit_for_test("line 1\n\nline 3\n"),
            "line 1\n\nline 3\r"
        );
    }

    #[test]
    fn prompt_submit_normalizes_mixed_cr_and_lf_without_dropping_text() {
        assert_eq!(
            encode_prompt_submit_for_test("alpha\rbravo\r\ncharlie\ndelta\r\n"),
            "alpha\nbravo\ncharlie\ndelta\r"
        );
    }

    #[test]
    fn prompt_submit_never_uses_bracketed_paste_or_csi_submit() {
        let encoded = encode_prompt_submit_for_test("line 1\nline 2\n");
        assert!(!encoded.contains("\x1b[200~"));
        assert!(!encoded.contains("\x1b[201~"));
        assert!(!encoded.contains("\x1b[13;1u"));
        assert!(encoded.ends_with('\r'));
    }

    #[test]
    fn prompt_submit_key_is_plain_carriage_return_for_delayed_write() {
        assert_eq!(prompt_submit_key(), "\r");
    }

    #[test]
    fn test_bare_cr_stays_cr() {
        // solo \r = Codex TUI redraw (cursor to col 0, same line) — must NOT become \r\n
        assert_eq!(
            normalize_pty_output("alpha\r\nbravo\rcharlie\ndelta"),
            "alpha\r\nbravo\rcharlie\r\ndelta"
        );
    }

    #[test]
    fn terminal_output_preserves_vt100_escape_payloads_while_preserving_cr() {
        // solo \r after VT100 escape stays as \r (cursor reposition, no new line)
        assert_eq!(
            normalize_pty_output("\x1b[2K\rprompt\r\nnext"),
            "\x1b[2K\rprompt\r\nnext"
        );
    }

    #[test]
    fn terminal_output_normalize_is_idempotent() {
        let once = normalize_pty_output("foo\r\nbar\rba\nz");
        let twice = normalize_pty_output(&once);
        assert_eq!(once, twice);
        assert_eq!(once, "foo\r\nbar\rba\r\nz");
    }

    #[test]
    fn test_utf8_boundary_korean() {
        let mut processor = PtyOutputProcessor::new(Instant::now());
        let text = "한글\r다음";
        let bytes = text.as_bytes();
        let split = bytes.len() - 2;
        assert!(processor
            .push_chunk(&bytes[..split], Instant::now())
            .is_none());
        let output = processor
            .push_chunk(
                &bytes[split..],
                Instant::now() + StdDuration::from_millis(60),
            )
            .expect("flush after utf8 boundary completion");
        assert_eq!(output, "한글\r다음");
    }

    #[test]
    fn ring_buffer_standalone_cr_clears_current_line() {
        let mut buf = super::TerminalRingBuffer::new(1024);
        buf.push("line1\r\n");
        buf.push("status_old\r"); // standalone CR — clears "status_old"
        buf.push("\x1b[Kstatus_new");
        assert_eq!(buf.data, "line1\r\n\r\x1b[Kstatus_new");

        // \r\n should be preserved (not treated as standalone CR)
        let mut buf2 = super::TerminalRingBuffer::new(1024);
        buf2.push("line1\r\nline2");
        assert_eq!(buf2.data, "line1\r\nline2");

        // Multiple CR updates — only latest remains
        let mut buf3 = super::TerminalRingBuffer::new(1024);
        buf3.push("output\r\n");
        buf3.push("status1\rstatus2\rstatus3");
        assert_eq!(buf3.data, "output\r\n\rstatus3");
    }

    #[test]
    fn test_ring_buffer_size() {
        assert_eq!(super::TERMINAL_SCREEN_BUFFER_BYTES, 256 * 1024);
        assert_eq!(super::TERMINAL_VOLATILE_BUFFER_MAX_BYTES, 256 * 1024);
        assert_eq!(super::TERMINAL_WS_REPLAY_CARD_LIMIT_BYTES, 256 * 1024);
        assert_eq!(super::TERMINAL_WS_REPLAY_MAX_LIMIT_BYTES, 256 * 1024);
        assert_eq!(super::TERMINAL_RING_BUFFER_BYTES, 256 * 1024);
    }

    #[test]
    fn test_batch_flush_escape_sequence() {
        let start = Instant::now();
        let mut processor = PtyOutputProcessor::new(start);
        assert!(processor.push_chunk(b"\x1b[31", start).is_none());
        let output = processor
            .push_chunk(b"mred\r", start + StdDuration::from_millis(60))
            .expect("flush after escape sequence completion");
        assert_eq!(output, "\x1b[31mred\r");
    }

    #[test]
    fn test_ws_rest_normalize_consistency() {
        let body = "alpha\r\nbeta\n";
        let rest = prompt_body_from_write_session(&WriteSession {
            input: Some(body.to_string()),
            data: None,
            prompt: None,
            repeat: None,
        });
        let ws = prompt_body_from_ws_value(&json!({ "prompt": body }));
        assert_eq!(rest, ws);
        assert_eq!(rest, "alpha\nbeta");
    }

    #[test]
    fn prompt_text_ack_waits_before_submit_can_follow() {
        assert!(super::PROMPT_TEXT_FLUSH_DELAY_MS >= 300);
        assert!(super::PROMPT_TEXT_FLUSH_DELAY_MS <= 1000);
    }

    #[test]
    fn terminal_replay_limit_matches_hq_tail_policy() {
        assert_eq!(super::TERMINAL_SCREEN_BUFFER_BYTES, 256 * 1024);
        assert_eq!(super::TERMINAL_VOLATILE_BUFFER_MAX_BYTES, 256 * 1024);
        assert_eq!(super::TERMINAL_WS_REPLAY_CARD_LIMIT_BYTES, 256 * 1024);
        assert_eq!(super::TERMINAL_WS_REPLAY_MAX_LIMIT_BYTES, 256 * 1024);
        assert_eq!(super::SESSION_LOG_VIEW_LIMIT_BYTES, 32 * 1024);
        assert_eq!(super::SESSION_LOG_MAX_TAIL_BYTES, 32 * 1024);
        assert_eq!(super::TERMINAL_LOG_ROTATE_BYTES, 512 * 1024);
        assert_eq!(super::TERMINAL_LOG_FLUSH_INTERVAL_MS, 50);
        assert_eq!(super::TERMINAL_LOG_FLUSH_CHUNK_BYTES, 50 * 1024);
        assert_eq!(super::TERMINAL_RING_BUFFER_BYTES, 256 * 1024);
        assert_eq!(super::PTY_READ_BUFFER_BYTES, 8 * 1024);
        assert_eq!(super::PTY_OUTPUT_BATCH_FLUSH_MS, 50);
    }

    #[test]
    fn tail_string_by_bytes_preserves_utf8_boundaries() {
        let value = format!("{}끝", "가".repeat(8));
        let tail = tail_string_by_bytes(&value, 7);
        assert_eq!(tail, "가끝");
    }

    #[test]
    fn strip_ansi_for_ui_removes_csi_and_osc_sequences() {
        let raw = "\u{1b}[2Khello\u{1b}]0;title\u{7}\u{1b}[31m world\u{1b}[0m";
        assert_eq!(strip_ansi_for_ui(raw), "hello world");
    }

    #[test]
    fn strip_ansi_for_ui_removes_leading_partial_csi_tail() {
        assert_eq!(strip_ansi_for_ui("2;36HWorking"), "Working");
        assert_eq!(strip_ansi_for_ui("35mReady"), "Ready");
        assert_eq!(strip_ansi_for_ui("Working"), "Working");
    }

    #[test]
    fn terminal_preview_text_for_ui_keeps_text_tail_within_byte_limit() {
        let raw = format!("{}\u{1b}[35m{}", "가".repeat(2048), "끝".repeat(2048));
        let text = terminal_preview_text_for_ui(&raw, super::SESSION_PREVIEW_LIMIT_BYTES);
        assert!(text.len() <= super::SESSION_PREVIEW_LIMIT_BYTES);
        assert!(text.ends_with("끝"));
    }

    #[test]
    fn terminal_display_snapshot_tracks_current_visible_text() {
        let mut snapshot = super::TerminalDisplaySnapshot::new(10);
        snapshot.push("ready\r\n");
        snapshot.push("\x1b[3;1HWorking");
        snapshot.push("\x1b[3;1HW");
        snapshot.push("\x1b[3;1HWo");
        snapshot.push("\x1b[3;1HWorking");
        let text = snapshot.text();
        assert!(text.contains("ready"));
        assert!(text.contains("Working"));
        assert!(!text.contains("\x1b[3;1H"));
        assert!(!text.contains("\r\nW\r\nWo"));
    }

    #[test]
    fn terminal_display_snapshot_restores_cursor_for_live_followup() {
        let mut snapshot = super::TerminalDisplaySnapshot::new(10);
        snapshot.push("ready\r\n");
        snapshot.push("\x1b[3;4HWorking");

        let ansi = snapshot.ansi_text();

        assert!(ansi.ends_with("\x1b[0m\x1b[3;11H"));
    }

    #[test]
    fn terminal_attach_snapshot_includes_full_clear_prefix() {
        let mut snapshot = super::TerminalDisplaySnapshot::new(10);
        snapshot.push("ready\r\n");
        snapshot.push("\x1b[2;1HWorking");

        let attach = format!(
            "{}{}",
            super::TERMINAL_ATTACH_CLEAR_PREFIX,
            snapshot.ansi_text()
        );

        assert!(attach.starts_with("\x1b[2J\x1b[3J\x1b[H"));
        assert!(attach.contains("Working"));
    }

    #[test]
    fn parse_attach_terminal_dims_clamps_when_present() {
        let value = serde_json::json!({ "type": "attach", "cols": 10, "rows": 999 });
        assert_eq!(super::parse_attach_terminal_dims(&value), Some((20, 120)));
    }

    #[test]
    fn parse_attach_terminal_dims_requires_both_values() {
        let value = serde_json::json!({ "type": "attach", "cols": 120 });
        assert_eq!(super::parse_attach_terminal_dims(&value), None);
    }

    #[tokio::test]
    async fn read_tail_lossy_returns_only_the_requested_tail_window() {
        let path = temp_test_file("read-tail-window.log");
        let content = (0..512)
            .map(|idx| format!("line-{idx:04}\n"))
            .collect::<String>();
        stdfs::write(&path, &content).unwrap();

        let tail = read_tail_lossy(path.clone(), 64).await.unwrap();

        assert!(tail.len() <= 64);
        assert!(tail.contains("line-0511"));
        assert!(!tail.contains("line-0000"));

        let _ = stdfs::remove_file(path);
    }

    #[tokio::test]
    async fn read_tail_lossy_returns_entire_file_when_under_limit() {
        let path = temp_test_file("read-tail-small.log");
        stdfs::write(&path, "alpha\nbeta\n").unwrap();

        let tail = read_tail_lossy(path.clone(), 1024).await.unwrap();

        assert_eq!(tail, "alpha\nbeta\n");

        let _ = stdfs::remove_file(path);
    }

    #[test]
    fn terminal_log_writer_flushes_when_chunk_limit_is_reached() {
        env::set_var(super::TERMINAL_PERSIST_LOGS_ENV, "1");
        let path = temp_test_file("terminal-log-writer-chunk-limit.log");
        let mut writer = super::TerminalLogWriter::new(path.clone(), "test-session".to_string());
        writer.write_session_banner();
        let baseline = stdfs::metadata(&path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);

        writer.push(&vec![b'x'; super::TERMINAL_LOG_FLUSH_CHUNK_BYTES]);

        let after_push = stdfs::metadata(&path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        assert!(after_push >= baseline + super::TERMINAL_LOG_FLUSH_CHUNK_BYTES as u64);

        writer.finish();
        let _ = stdfs::remove_file(path);
        env::remove_var(super::TERMINAL_PERSIST_LOGS_ENV);
    }

    #[test]
    fn terminal_log_writer_finish_flushes_pending_bytes() {
        env::set_var(super::TERMINAL_PERSIST_LOGS_ENV, "1");
        let path = temp_test_file("terminal-log-writer-finish.log");
        let mut writer = super::TerminalLogWriter::new(path.clone(), "test-session".to_string());
        writer.write_session_banner();
        let baseline = stdfs::metadata(&path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);

        writer.push(b"pending-tail");
        let before_finish = stdfs::metadata(&path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        assert_eq!(before_finish, baseline);

        writer.finish();

        let content = stdfs::read_to_string(&path).unwrap();
        assert!(content.contains("pending-tail"));
        let _ = stdfs::remove_file(path);
        env::remove_var(super::TERMINAL_PERSIST_LOGS_ENV);
    }

    #[test]
    fn work_event_kind_defaults_to_note() {
        assert_eq!(normalize_work_event_kind(None).unwrap(), "note");
    }

    #[test]
    fn work_event_kind_normalizes_known_state_events() {
        assert_eq!(
            normalize_work_event_kind(Some(" ACKNOWLEDGED ".to_string())).unwrap(),
            "acknowledged"
        );
        assert_eq!(
            normalize_work_event_kind(Some("HEARTBEAT".to_string())).unwrap(),
            "heartbeat"
        );
        assert_eq!(
            normalize_work_event_kind(Some("qa-pass".to_string())).unwrap(),
            "qa-pass"
        );
    }

    #[test]
    fn work_event_kind_rejects_unknown_values() {
        let err = normalize_work_event_kind(Some("maybe-later".to_string())).unwrap_err();
        assert_eq!(err.status, StatusCode::BAD_REQUEST);
    }

    fn temp_test_file(name: &str) -> PathBuf {
        let unique = uuid::Uuid::new_v4().to_string();
        env::temp_dir().join(format!("lcc-core-{unique}-{name}"))
    }
}

async fn resolve_terminal_replay(
    state: &AppState,
    id: &str,
    limit_bytes: u64,
) -> Result<String, ApiError> {
    let runtime_config = terminal_runtime_config();
    let limit = limit_bytes.clamp(512, runtime_config.max_replay_bytes);
    if state.sessions.read().await.contains_key(id) {
        if let Some(replay) = terminal_buffer_tail(state, id, limit as usize) {
            return Ok(replay);
        }
        return Ok(String::new());
    }
    let Some(record) = read_os_agent_record(id).await else {
        return Err(ApiError::not_found("session not found"));
    };
    if !os_agent_is_attached(&record).await {
        return Err(ApiError::conflict("OS agent is detached from this API"));
    }
    let path = record
        .log_path
        .map(PathBuf::from)
        .unwrap_or_else(|| terminal_log_path(id));
    read_tail_lossy_or_empty(path, limit)
        .await
        .map_err(ApiError::internal)
}

pub(crate) async fn build_internal_session_view(
    state: &AppState,
    meta: SessionMeta,
) -> Result<SessionView, ApiError> {
    let log_path = terminal_log_path(&meta.id);
    let runtime_config = terminal_runtime_config();
    let preview =
        terminal_buffer_tail(state, &meta.id, runtime_config.preview_bytes).unwrap_or_default();
    // Use display snapshot (rendered 2D grid) for preview_text when available.
    // Fallback strip_ansi_for_ui on raw ring buffer is incorrect for Codex TUI sessions:
    // cursor-motion sequences (ESC[row;colH) are stripped but raw chars remain in stream order,
    // producing garbled text. Empty string is correct when no display snapshot exists —
    // the WS attach will deliver accurate content shortly.
    let display_snapshot_volatile = terminal_display_snapshot_is_volatile(state, &meta.id);
    let preview_text = terminal_display_snapshot_text(state, &meta.id)
        .map(|snapshot| tail_string_by_bytes(&snapshot, runtime_config.preview_bytes))
        .unwrap_or_default();
    let preview_ansi = terminal_display_snapshot_ansi_text(state, &meta.id)
        .map(|snapshot| tail_string_by_bytes(&snapshot, runtime_config.preview_bytes));
    let mut view = build_session_view_with_preview_text(
        meta,
        tail_string_by_bytes(&preview, runtime_config.preview_bytes),
        preview_text,
        SessionSource::Internal,
        true,
        true,
        None,
        log_path,
    );
    view.preview_ansi = preview_ansi;
    view.display_snapshot_volatile = display_snapshot_volatile;
    Ok(view)
}

fn terminal_buffer_tail(state: &AppState, id: &str, max_bytes: usize) -> Option<String> {
    state
        .terminal_buffers
        .lock()
        .ok()
        .and_then(|buffers| buffers.get(id).map(|buffer| buffer.tail(max_bytes)))
}

fn terminal_display_snapshot_text(state: &AppState, id: &str) -> Option<String> {
    let current = state
        .terminal_display_snapshots
        .lock()
        .ok()
        .and_then(|snapshots| snapshots.get(id).map(TerminalDisplaySnapshot::text))
        .filter(|text| !text.is_empty());
    current.or_else(|| {
        // Fall back to last non-empty snapshot during ESC[2J redraw windows (P1-G).
        state
            .terminal_last_nonempty_snapshots
            .lock()
            .ok()
            .and_then(|cache| cache.get(id).cloned())
            .filter(|text| !text.is_empty())
    })
}

fn terminal_display_snapshot_is_volatile(state: &AppState, id: &str) -> bool {
    // Returns true when current display snapshot is empty (inside ESC[2J redraw window).
    state
        .terminal_display_snapshots
        .lock()
        .ok()
        .and_then(|snapshots| snapshots.get(id).map(TerminalDisplaySnapshot::text))
        .map(|t| t.is_empty())
        .unwrap_or(true)
}

fn terminal_display_snapshot_ansi_text(state: &AppState, id: &str) -> Option<String> {
    state
        .terminal_display_snapshots
        .lock()
        .ok()
        .and_then(|snapshots| snapshots.get(id).map(TerminalDisplaySnapshot::ansi_text))
        .filter(|text| !text.is_empty())
}

async fn write_raw_to_session(
    state: &AppState,
    id: &str,
    data: String,
) -> Result<SessionView, ApiError> {
    write_session_bytes(state, id, data, false).await
}

async fn write_session_bytes(
    state: &AppState,
    id: &str,
    data: String,
    echo_input: bool,
) -> Result<SessionView, ApiError> {
    let Some(session) = state.sessions.read().await.get(id).cloned() else {
        if let Some(record) = read_os_agent_record(id).await {
            if !os_agent_is_attached(&record).await {
                return Err(ApiError::conflict("OS agent is detached from this API"));
            }
            let Some(write_url) = os_agent_write_url(&record) else {
                return Err(ApiError::bad_request(
                    "OS agent is attached but does not expose a write endpoint",
                ));
            };
            os_agent_control_write(&write_url, &data).await?;
            let preview = read_os_agent_preview(&record).await.unwrap_or_default();
            return Ok(os_agent_view(record, preview, true));
        }
        return Err(ApiError::not_found("session not found"));
    };
    let mut session = session.lock().await;
    if !data.is_empty() {
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(ApiError::internal)?;
        session.writer.flush().map_err(ApiError::internal)?;
        session.touch();
        if echo_input {
            let _ = state.tx.send(ServerEvent::Input {
                session_id: id.to_string(),
                data,
            });
        }
    }
    let meta = session.meta.clone();
    drop(session);
    build_internal_session_view(state, meta).await
}

pub(crate) fn spawn_pty_reader(state: AppState, id: String, mut reader: Box<dyn Read + Send>) {
    let log_path = terminal_log_path(&id);
    thread::spawn(move || {
        if let Ok(mut buffers) = state.terminal_buffers.lock() {
            buffers.insert(
                id.clone(),
                TerminalRingBuffer::new(terminal_runtime_config().ring_buffer_bytes),
            );
        }
        if let Ok(mut snapshots) = state.terminal_display_snapshots.lock() {
            snapshots.insert(id.clone(), TerminalDisplaySnapshot::new(150));
        }
        let mut log_writer = TerminalLogWriter::new(log_path, id.clone());
        let mut output_processor = PtyOutputProcessor::new(Instant::now());
        log_writer.write_session_banner();
        let mut buf = [0_u8; PTY_READ_BUFFER_BYTES];
        loop {
            let Ok(n) = reader.read(&mut buf) else {
                break;
            };
            if n == 0 {
                break;
            }
            log_writer.push(&buf[..n]);
            if let Some(data) = output_processor.push_chunk(&buf[..n], Instant::now()) {
                append_terminal_output(&state, &id, data);
            }
        }
        if let Some(data) = output_processor.finish(Instant::now()) {
            append_terminal_output(&state, &id, data);
        }
        log_writer.finish();
    });
}

pub(crate) fn terminal_log_path(id: &str) -> PathBuf {
    let safe_id: String = id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect();
    PathBuf::from("data")
        .join("terminal-logs")
        .join(format!("{safe_id}.ansi.log"))
}

pub(crate) async fn resolve_session_view(
    state: &AppState,
    id: &str,
) -> Result<SessionView, ApiError> {
    if let Some(session) = state.sessions.read().await.get(id).cloned() {
        let meta = session.lock().await.meta.clone();
        return build_internal_session_view(state, meta).await;
    }
    let Some(record) = read_os_agent_record(id).await else {
        return Err(ApiError::not_found("session not found"));
    };
    let attached = os_agent_is_attached(&record).await;
    let preview = read_os_agent_preview(&record).await.unwrap_or_default();
    Ok(os_agent_view(record, preview, attached))
}

pub(crate) async fn resolve_session_log_path(
    id: &str,
) -> Result<(SessionSource, PathBuf), ApiError> {
    if let Some(record) = read_os_agent_record(id).await {
        if !os_agent_is_attached(&record).await {
            return Err(ApiError::not_found("OS agent is detached from this API"));
        }
        let path = record
            .log_path
            .map(PathBuf::from)
            .unwrap_or_else(|| terminal_log_path(id));
        return Ok((SessionSource::Os, path));
    }
    Ok((SessionSource::Internal, terminal_log_path(id)))
}

pub(crate) fn spawn_pty_waiter<F>(state: AppState, id: String, wait: F)
where
    F: FnOnce() -> Option<i32> + Send + 'static,
{
    let handle = Handle::current();
    thread::spawn(move || {
        let code = wait();
        let state_for_status = state.clone();
        let id_for_status = id.clone();
        handle.spawn(async move {
            if let Some(session) = state_for_status
                .sessions
                .read()
                .await
                .get(&id_for_status)
                .cloned()
            {
                let mut session = session.lock().await;
                session.meta.status = SessionStatus::Exited;
                session.meta.exit_code = code;
                session.meta.updated_at = Utc::now();
            }
        });
        let _ = state.tx.send(ServerEvent::Exit {
            session_id: id,
            code,
        });
    });
}

impl TerminalSession {
    fn touch(&mut self) {
        self.meta.updated_at = Utc::now();
    }
}

pub(crate) async fn read_os_agent_views(internal_ids: &HashSet<String>) -> Vec<SessionView> {
    let attachment_states = read_os_agent_attachment_states().await;
    let mut views = Vec::new();
    for record in read_os_agent_records().await {
        if internal_ids.contains(&record.id) {
            continue;
        }
        let attached = os_agent_attached_by_default(&record, &attachment_states);
        if !attached {
            continue;
        }
        let preview = read_os_agent_preview(&record).await.unwrap_or_default();
        views.push(os_agent_view(record, preview, true));
    }
    views
}

pub(crate) async fn read_os_agent_record(id: &str) -> Option<OsAgentRecord> {
    read_os_agent_records()
        .await
        .into_iter()
        .find(|record| record.id == id)
}

fn os_agent_registry_path() -> Option<PathBuf> {
    let raw = env::var("LCC_OS_AGENT_REGISTRY").ok();
    match raw.as_deref().map(str::trim) {
        Some("") | Some("0") | Some("off") | Some("false") | Some("none") | Some("disabled") => {
            None
        }
        Some(path) => Some(PathBuf::from(path)),
        None => None,
    }
}

pub(crate) async fn read_os_agent_records() -> Vec<OsAgentRecord> {
    let Some(path) = os_agent_registry_path() else {
        return Vec::new();
    };
    let Ok(text) = fs::read_to_string(path).await else {
        return Vec::new();
    };
    let text = text.trim_start_matches('\u{feff}');
    serde_json::from_str::<Vec<OsAgentRecord>>(text).unwrap_or_default()
}

fn os_agent_attachment_path() -> PathBuf {
    if let Ok(path) = env::var("LCC_OS_AGENT_ATTACHMENTS") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    if let Some(path) = os_agent_registry_path() {
        if let Some(parent) = path.parent() {
            return parent.join("attachments.json");
        }
    }
    PathBuf::from("data/os-agents/attachments.json")
}

pub(crate) async fn read_os_agent_attachment_states() -> HashMap<String, OsAgentAttachmentRecord> {
    let path = os_agent_attachment_path();
    let Ok(text) = fs::read_to_string(path).await else {
        return HashMap::new();
    };
    let text = text.trim_start_matches('\u{feff}');
    serde_json::from_str::<HashMap<String, OsAgentAttachmentRecord>>(text).unwrap_or_default()
}

async fn write_os_agent_attachment_states(
    states: &HashMap<String, OsAgentAttachmentRecord>,
) -> Result<(), ApiError> {
    let path = os_agent_attachment_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(ApiError::internal)?;
    }
    let text = serde_json::to_string_pretty(states).map_err(ApiError::internal)?;
    fs::write(path, text).await.map_err(ApiError::internal)
}

pub(crate) async fn set_os_agent_attached(id: &str, attached: bool) -> Result<(), ApiError> {
    let mut states = read_os_agent_attachment_states().await;
    states.insert(
        id.to_string(),
        OsAgentAttachmentRecord {
            attached,
            updated_at: Some(Utc::now()),
        },
    );
    write_os_agent_attachment_states(&states).await
}

pub(crate) fn os_agent_attached_by_default(
    record: &OsAgentRecord,
    states: &HashMap<String, OsAgentAttachmentRecord>,
) -> bool {
    if let Some(state) = states.get(&record.id) {
        return state.attached;
    }
    !matches!(
        record.status.as_deref(),
        Some("stopped") | Some("exited") | Some("error")
    )
}

async fn os_agent_is_attached(record: &OsAgentRecord) -> bool {
    let states = read_os_agent_attachment_states().await;
    os_agent_attached_by_default(record, &states)
}

pub(crate) async fn read_os_agent_preview(record: &OsAgentRecord) -> std::io::Result<String> {
    let Some(path) = record.log_path.as_ref() else {
        return Ok(String::new());
    };
    let runtime_config = terminal_runtime_config();
    let text = read_tail_lossy(PathBuf::from(path), runtime_config.preview_bytes as u64).await?;
    Ok(tail_string_by_bytes(&text, runtime_config.preview_bytes))
}

fn os_agent_write_url(record: &OsAgentRecord) -> Option<String> {
    record
        .write_url
        .as_deref()
        .or(record.control_url.as_deref())
        .or(record.attach_url.as_deref())
        .map(normalize_os_agent_write_url)
}

fn normalize_os_agent_write_url(url: &str) -> String {
    let base = url.trim_end_matches('/');
    if base.ends_with("/write") {
        base.to_string()
    } else if let Some(prefix) = base.strip_suffix("/control") {
        format!("{prefix}/write")
    } else {
        format!("{base}/write")
    }
}

async fn os_agent_control_write(write_url: &str, data: &str) -> Result<(), ApiError> {
    let base = write_url.trim_end_matches('/');
    let Some(rest) = base.strip_prefix("http://") else {
        return Err(ApiError::bad_request(
            "OS agent write endpoint must use http://",
        ));
    };
    let (host_port, path_prefix) = match rest.split_once('/') {
        Some((host_port, path)) => (host_port, format!("/{path}")),
        None => (rest, "/write".to_string()),
    };
    let addr = host_port
        .to_socket_addrs()
        .map_err(ApiError::internal)?
        .next()
        .ok_or_else(|| ApiError::bad_request("OS agent write endpoint did not resolve"))?;
    let body =
        serde_json::to_vec(&json!({ "input": data, "data": data })).map_err(ApiError::internal)?;
    let request = format!(
        "POST {} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        path_prefix, host_port, body.len()
    );
    let mut stream = TcpStream::connect(addr).await.map_err(ApiError::internal)?;
    stream
        .write_all(request.as_bytes())
        .await
        .map_err(ApiError::internal)?;
    stream.write_all(&body).await.map_err(ApiError::internal)?;
    stream.flush().await.map_err(ApiError::internal)?;
    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .await
        .map_err(ApiError::internal)?;
    let status = parse_http_response_status(&response).ok_or_else(|| {
        ApiError::bad_request("OS agent write endpoint returned an invalid HTTP response")
    })?;
    if !(200..300).contains(&status) {
        return Err(ApiError::bad_request(format!(
            "OS agent control write failed with HTTP {status}: {}",
            http_response_body_preview(&response)
        )));
    }
    Ok(())
}

fn parse_http_response_status(response: &[u8]) -> Option<u16> {
    let line_end = response.windows(2).position(|window| window == b"\r\n")?;
    let status_line = std::str::from_utf8(&response[..line_end]).ok()?;
    let mut parts = status_line.split_whitespace();
    let version = parts.next()?;
    if !version.starts_with("HTTP/") {
        return None;
    }
    parts.next()?.parse().ok()
}

fn http_response_body_preview(response: &[u8]) -> String {
    let body = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|idx| &response[idx + 4..])
        .unwrap_or_default();
    let text = String::from_utf8_lossy(body).trim().to_string();
    if text.is_empty() {
        "<empty body>".to_string()
    } else {
        text.chars().take(200).collect()
    }
}

pub(crate) fn os_agent_view(record: OsAgentRecord, preview: String, attached: bool) -> SessionView {
    let now = Utc::now();
    let interactive = os_agent_write_url(&record).is_some();
    let log_path = record
        .log_path
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| terminal_log_path(&record.id));
    let status = match record.status.as_deref() {
        Some("stopped") => SessionStatus::Stopped,
        Some("error") => SessionStatus::Error,
        Some("exited") => SessionStatus::Exited,
        _ => SessionStatus::Active,
    };
    build_session_view(
        SessionMeta {
            id: record.id,
            name: record.name,
            team: record.team,
            cwd: record.cwd,
            cmd: record.cmd,
            args: record.args,
            model: record.model,
            status,
            pid: record.pid,
            created_at: record.created_at.unwrap_or(now),
            updated_at: record.updated_at.unwrap_or(now),
            exit_code: None,
        },
        preview,
        SessionSource::Os,
        attached,
        interactive,
        if !attached {
            Some("OS agent is detached from this API".to_string())
        } else if interactive {
            None
        } else {
            Some("OS agent is attached as a bounded log-backed session; write endpoint is unavailable".to_string())
        },
        log_path,
    )
}

pub(crate) async fn active_session_count(state: &AppState) -> usize {
    let sessions = state.sessions.read().await;
    let mut active = 0;
    for session in sessions.values() {
        if matches!(session.lock().await.meta.status, SessionStatus::Active) {
            active += 1;
        }
    }
    active
}

// P1-C auto-guard: standard sessions to respawn when pool is empty.
const P1C_GUARD_SESSIONS: &[(&str, &str, &str)] = &[
    ("branch-ceo", "codex.cmd", "workspaces/ceo/repo"),
    ("dev-lead", "codex.cmd", "workspaces/dev-lead/repo"),
    ("lux", "codex.cmd", "workspaces/lux/repo"),
    ("arum", "codex.cmd", "workspaces/arum/repo"),
];
pub(crate) const P1C_LOW_WATERMARK: usize = 4;

async fn spawn_standard_session(
    state: &AppState,
    id: &str,
    cmd: &str,
    cwd: &str,
) -> Result<(), String> {
    if state.sessions.read().await.contains_key(id) {
        return Ok(());
    }
    fs::create_dir_all(cwd)
        .await
        .map_err(|e| format!("workspace create failed: {e}"))?;
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 36,
            cols: 140,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("pty open failed: {e}"))?;
    let mut command = CommandBuilder::new(cmd);
    command.cwd(cwd);
    let mut child = pair
        .slave
        .spawn_command(command)
        .map_err(|e| format!("spawn failed: {e}"))?;
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("pty reader failed: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("pty writer failed: {e}"))?;
    let meta = SessionMeta {
        id: id.to_string(),
        name: id.to_string(),
        team: "lcc".to_string(),
        cwd: cwd.to_string(),
        cmd: cmd.to_string(),
        args: vec![],
        model: None,
        status: SessionStatus::Active,
        pid: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        exit_code: None,
    };
    let session = Arc::new(Mutex::new(TerminalSession {
        meta,
        _master: pair.master,
        writer,
    }));
    state.sessions.write().await.insert(id.to_string(), session);
    spawn_pty_reader(state.clone(), id.to_string(), reader);
    spawn_pty_waiter(state.clone(), id.to_string(), move || {
        child.wait().ok().map(|status| status.exit_code() as i32)
    });
    Ok(())
}

// Respawns standard sessions when the pool is empty (P1-C guard — SOP §9 BE internalization).
pub(crate) async fn ensure_minimum_sessions(state: &AppState) {
    let session_count = state.sessions.read().await.len();
    if session_count > 0 {
        return;
    }
    tracing::warn!(
        "P1-C auto-guard triggered: sessions=0, respawning {} standard sessions",
        P1C_GUARD_SESSIONS.len()
    );
    for (id, cmd, cwd) in P1C_GUARD_SESSIONS {
        match spawn_standard_session(state, id, cmd, cwd).await {
            Ok(_) => tracing::info!("P1-C auto-guard: spawned {id}"),
            Err(e) => tracing::error!("P1-C auto-guard: spawn failed for {id}: {e}"),
        }
    }
}

pub(crate) fn active_session_limit() -> Option<usize> {
    match env::var("LCC_MAX_ACTIVE_SESSIONS") {
        Ok(value) => value.parse::<usize>().ok().filter(|value| *value > 0),
        Err(_) => Some(20),
    }
}

fn require_field(value: Option<String>, field: &str) -> Result<String, ApiError> {
    let Some(value) = value else {
        return Err(ApiError::bad_request(format!("{field} is required")));
    };
    if value.trim().is_empty() {
        return Err(ApiError::bad_request(format!("{field} is required")));
    }
    Ok(value)
}

impl CanvasStore {
    async fn new(path: PathBuf) -> anyhow::Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        let canvases = match fs::read_to_string(&path).await {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
            Err(_) => Vec::new(),
        };
        Ok(Self {
            path: Arc::new(path),
            canvases: Arc::new(RwLock::new(canvases)),
        })
    }

    async fn persist(&self, canvases: &[Canvas]) -> Result<(), ApiError> {
        let raw = serde_json::to_string_pretty(canvases).map_err(ApiError::internal)?;
        fs::write(&*self.path, raw)
            .await
            .map_err(ApiError::internal)
    }

    async fn update(&self, id: &str, f: impl FnOnce(&mut Canvas)) -> Result<Canvas, ApiError> {
        let mut canvases = self.canvases.write().await;
        let canvas = canvases
            .iter_mut()
            .find(|canvas| canvas.id == id)
            .ok_or_else(|| ApiError::not_found("canvas not found"))?;
        f(canvas);
        let result = canvas.clone();
        self.persist(&canvases).await?;
        Ok(result)
    }
}

impl PeerStore {
    async fn new(path: PathBuf) -> anyhow::Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        let messages = match fs::read_to_string(&path).await {
            Ok(raw) => raw
                .lines()
                .filter_map(|line| {
                    let line = line.trim();
                    if line.is_empty() {
                        None
                    } else {
                        serde_json::from_str::<PeerMessage>(line).ok()
                    }
                })
                .collect(),
            Err(_) => Vec::new(),
        };
        Ok(Self {
            path: Arc::new(path),
            messages: Arc::new(RwLock::new(messages)),
        })
    }

    async fn insert(&self, message: PeerMessage) -> Result<(), ApiError> {
        let raw = serde_json::to_string(&message).map_err(ApiError::internal)?;
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&*self.path)
            .await
            .map_err(ApiError::internal)?;
        file.write_all(raw.as_bytes())
            .await
            .map_err(ApiError::internal)?;
        file.write_all(b"\n").await.map_err(ApiError::internal)?;
        file.flush().await.map_err(ApiError::internal)?;
        self.messages.write().await.push(message);
        Ok(())
    }
}

impl MemoryStore {
    async fn new(path: PathBuf) -> anyhow::Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        let entries = match fs::read_to_string(&path).await {
            Ok(raw) => raw
                .lines()
                .filter_map(|line| {
                    let line = line.trim();
                    if line.is_empty() {
                        None
                    } else {
                        serde_json::from_str::<MemoryEntry>(line).ok()
                    }
                })
                .collect(),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                fs::write(&path, "").await?;
                Vec::new()
            }
            Err(err) => return Err(err.into()),
        };
        Ok(Self {
            path: Arc::new(path),
            entries: Arc::new(RwLock::new(entries)),
        })
    }
}

impl DailyMemoryStore {
    async fn new(dir: PathBuf) -> anyhow::Result<Self> {
        fs::create_dir_all(&dir).await?;
        Ok(Self { dir: Arc::new(dir) })
    }
}

#[cfg(windows)]
pub(crate) fn default_shell() -> String {
    "powershell.exe".to_string()
}

#[cfg(not(windows))]
pub(crate) fn default_shell() -> String {
    "bash".to_string()
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn not_found(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            message: message.into(),
        }
    }

    fn conflict(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            message: message.into(),
        }
    }

    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
        }
    }

    fn unauthorized(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            message: message.into(),
        }
    }

    fn service_unavailable(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::SERVICE_UNAVAILABLE,
            message: message.into(),
        }
    }

    fn internal(error: impl std::fmt::Display) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: error.to_string(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        (self.status, Json(json!({ "error": self.message }))).into_response()
    }
}
