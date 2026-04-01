// Centralised API client for the Claude Cowork FastAPI backend.

function resolveApiBase() {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) return configured;

  if (typeof window === "undefined") return "";

  const { protocol, hostname, port } = window.location;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  const isViteDevPort = port === "5173" || port === "4173";

  // In local Vite dev, talk directly to the FastAPI server to avoid flaky WS proxying.
  if (isLocalHost && isViteDevPort) {
    return `${protocol}//${hostname}:8000`;
  }

  return "";
}

const API_BASE = resolveApiBase();

async function request(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`${method} ${path} → ${res.status}: ${detail}`);
  }
  return res.json();
}

// ── Sessions ─────────────────────────────────────────────
export const createSession = () => request("POST", "/sessions");
export const listSessions = () => request("GET", "/sessions");
export const getSession = (id) => request("GET", `/sessions/${id}`);
export const deleteSession = (id) => request("DELETE", `/sessions/${id}`);

// ── Prompt / Approvals / Input ───────────────────────────
export const sendPrompt = (id, prompt) =>
  request("POST", `/sessions/${id}/prompt`, { prompt });

export const sendApproval = (id, requestId, approved) =>
  request("POST", `/sessions/${id}/approval/${requestId}`, { approved });

export const sendUserInput = (id, requestId, answer, wasFreeform = true) =>
  request("POST", `/sessions/${id}/input/${requestId}`, {
    answer,
    was_freeform: wasFreeform,
  });

export const abortTurn = (id) =>
  request("POST", `/sessions/${id}/abort`);

export const getHistory = (id) =>
  request("GET", `/sessions/${id}/history`);

// ── WebSocket event stream ───────────────────────────────
export function connectEvents(sessionId) {
  const wsBase = API_BASE
    ? API_BASE.replace(/^http/, "ws")
    : `ws://${window.location.host}`;
  const socket = new WebSocket(
    `${wsBase}/sessions/${sessionId}/events`
  );
  return {
    socket,
    close: () => socket.close(),
  };
}
