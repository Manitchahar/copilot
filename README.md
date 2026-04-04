# Rocky Operator Console

Rocky is a local-first browser UI for the GitHub Copilot SDK. It wraps an interactive coding session in a cleaner web app with streaming responses, tool activity, approvals, user-input requests, attachments, and MCP-ready configuration.

## What It Does

- Starts and resumes Copilot SDK sessions from a FastAPI backend
- Streams assistant responses and tool activity into a React UI
- Handles approval requests and ask-user prompts in the browser
- Supports local path attachments and browser uploads
- Exposes MCP, skills, and custom-agent configuration in the app
- Keeps the project ready for richer local automation workflows

## Current Product Shape

This repo is intentionally focused on the core session experience:

- `Workspace`: start a new task and reopen recent sessions
- `Session`: run prompts, watch progress, approve actions, answer follow-up questions
- `Connectors`: configure MCP servers, skills, and custom agents

It is currently optimized for a single active session at a time so the core flow stays predictable during local development.

## Stack

- Frontend: React + Vite + Tailwind
- Backend: FastAPI + Python
- Runtime: GitHub Copilot SDK

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- A configured GitHub Copilot SDK environment

### Install

```bash
npm install
python -m venv .venv
./.venv/bin/pip install fastapi uvicorn github-copilot-sdk
```

### Run

```bash
npm run dev
```

That starts:

- frontend on `http://127.0.0.1:5173`
- backend on `http://127.0.0.1:8000`

You can still run them separately if needed:

```bash
npm run dev:web
npm run dev:api
```

## Configuration

Runtime behavior lives in [`config.yaml`](./config.yaml).

Use it to control things like:

- model
- streaming
- approval mode
- working directory
- MCP servers
- skills
- custom agents

## Notes

- This is a local-first prototype, not a hosted multi-user SaaS app.
- The session UX has been simplified over time, but there are still rough edges to polish.
- MCP support is wired into the backend and connector UI, but each server still needs its own auth and setup.

## Why This Repo Exists

This project is an exploration of what a practical GitHub Copilot SDK UI can look like beyond the terminal: less raw than a CLI, more interactive than a simple chat box, and ready for future automation through MCP.
