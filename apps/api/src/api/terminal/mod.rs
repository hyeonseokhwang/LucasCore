use std::collections::HashSet;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use serde_json::{json, Value};

use crate::{
    apply_attach_terminal_dims, event_session_id, handle_terminal_protocol,
    terminal_current_display_for_attach, AppState, ServerEvent,
};

pub(crate) async fn terminal_ws(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| terminal_socket(socket, state))
}

pub(crate) async fn terminal_socket(mut socket: WebSocket, state: AppState) {
    let mut rx = state.tx.subscribe();
    let mut attached_sessions = HashSet::<String>::new();
    loop {
        tokio::select! {
            event = rx.recv() => {
                let Ok(event) = event else {
                    break;
                };
                if let Some(session_id) = event_session_id(&event) {
                    if !attached_sessions.contains(session_id) && !matches!(event, ServerEvent::SessionDeleted { .. } | ServerEvent::Exit { .. }) {
                        continue;
                    }
                }
                let Ok(text) = serde_json::to_string(&event) else {
                    continue;
                };
                if socket.send(Message::Text(text)).await.is_err() {
                    break;
                }
            }
            inbound = socket.recv() => {
                let Some(Ok(message)) = inbound else {
                    break;
                };
                if let Message::Text(text) = message {
                    let mut attach_session_id: Option<String> = None;
                    let mut attach_error: Option<Value> = None;
                    if let Ok(value) = serde_json::from_str::<Value>(&text) {
                        if value.get("type").and_then(Value::as_str) == Some("attach") {
                            if let Some(session_id) = value.get("sessionId").or_else(|| value.get("session_id")).and_then(Value::as_str) {
                                attach_session_id = Some(session_id.to_string());
                                attached_sessions.insert(session_id.to_string());
                                let pre_resize_snapshot = terminal_current_display_for_attach(&state, session_id);
                                if let Err(err) = apply_attach_terminal_dims(&state, session_id, &value).await {
                                    attach_error = Some(
                                        json!({ "type": "error", "sessionId": session_id, "message": err.message }),
                                    );
                                }
                                if value.get("requestReplay").or_else(|| value.get("request_replay")).and_then(Value::as_bool) != Some(true) {
                                    if let Some(error) = attach_error {
                                        if socket.send(Message::Text(error.to_string())).await.is_err() {
                                            break;
                                        }
                                        continue;
                                    }
                                    let attached = json!({ "type": "attached", "sessionId": session_id });
                                    if socket.send(Message::Text(attached.to_string())).await.is_err() {
                                        break;
                                    }
                                    if let Some(snapshot) = pre_resize_snapshot {
                                        let current = json!({ "type": "snapshot", "sessionId": session_id, "data": snapshot });
                                        if socket.send(Message::Text(current.to_string())).await.is_err() {
                                            break;
                                        }
                                    }
                                    continue;
                                }
                            }
                        }
                    }
                    if let Some(error) = attach_error {
                        if socket.send(Message::Text(error.to_string())).await.is_err() {
                            break;
                        }
                        continue;
                    }
                    if let Some(response) = handle_terminal_protocol(&state, &text).await {
                        if socket.send(Message::Text(response.to_string())).await.is_err() {
                            break;
                        }
                        if let Some(session_id) = attach_session_id {
                            let attached = json!({ "type": "attached", "sessionId": session_id });
                            if socket.send(Message::Text(attached.to_string())).await.is_err() {
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
}
