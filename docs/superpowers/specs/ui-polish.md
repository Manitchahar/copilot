# Claude Cowork — UI Polish Design Spec

## Problem Statement

Claude Cowork is a full-stack AI assistant (React + FastAPI + Copilot SDK) with a working prototype. The web UI has two critical gaps:

1. **Tool execution is invisible** — when the AI reads files, runs commands, or edits code, the user sees nothing. The assistant's response just appears.
2. **Chat experience is rough** — no markdown rendering, naive scroll behavior, no message grouping, no typing indicator, raw text only.

The goal is to make the chat feel rich and professional — like T3 Code or Claude.ai — while keeping the warm "coworker" personality expressed through the Material Design 3 palette.

## Proposed Approach

Follow T3 Code's architecture pattern: headless primitives + Tailwind + focused libraries for specific capabilities. Adapt to our existing React 18 + Vite 6 + Tailwind 3 stack.

### Dependencies to Add

| Package | Purpose | Size (gzip) |
|---------|---------|-------------|
| `react-markdown` | Markdown → React components | ~5KB |
| `remark-gfm` | GitHub-flavored markdown (tables, strikethrough, task lists) | ~2KB |
| `rehype-highlight` | Syntax highlighting for code blocks | ~3KB + language grammars |
| `highlight.js` | Language grammars for rehype-highlight | Tree-shakeable per language |
| `@formkit/auto-animate` | Lightweight automatic animations for list changes | ~2KB |
| `@base-ui-components/react` | Headless unstyled primitives (Collapsible, Tooltip) | Tree-shakeable |
| `tailwind-merge` | Merge Tailwind classes without conflicts | ~3KB |
| `class-variance-authority` | Component variant definitions | ~1KB |

**Not adding** (deferred to later):
- `@xterm/xterm` — terminal emulator (when we build a terminal panel)
- `zustand` — global state (current useState pattern is fine for now)
- `@tanstack/react-virtual` — virtualized lists (optimize later if needed)
- `framer-motion` — too heavy; auto-animate covers our needs

### Electron Compatibility

All chosen deps are Electron-compatible. No SSR dependencies, no Node-only APIs in the frontend.

---

## Design: Tool Execution Visibility

### Event Classification

Classify WebSocket events into three tiers for display:

| Tier | Events | Display |
|------|--------|---------|
| **Action** (state-changing) | `tool_start` where tool writes/executes, `permission_requested` | Prominent card with icon, name, status |
| **Research** (read-only) | `tool_start` where tool reads/searches | Collapsed summary: "Researched 3 files" |
| **Meta** (system) | `turn_started`, `turn_complete`, `session_started` | Subtle inline divider or hidden |

### Tool Event Card Component

```
┌─────────────────────────────────────────┐
│ ◉ Running command                       │  ← Action tier: always visible
│ ┌─────────────────────────────────────┐ │
│ │ $ npm run build                     │ │  ← Command/tool detail
│ └─────────────────────────────────────┘ │
│ ⏱ 3.2s                          ✓ Done │  ← Duration + status
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 📖 Researched 5 files              ▸   │  ← Research tier: collapsed
└─────────────────────────────────────────┘
  ↓ (click to expand)
│ • src/api.js                            │
│ • src/pages/ActiveSessionPage.jsx       │
│ • engine.py                             │
│ • config.yaml                           │
│ • package.json                          │
```

### Tool Event States

Each tool card transitions through states:
- **Running** — spinning indicator, elapsed timer, name visible
- **Complete (success)** — green check, duration, collapsible output
- **Complete (error)** — red X, error text visible by default
- **Awaiting approval** — amber banner, approve/deny buttons (existing PermissionBanner, restyled)

### Tool Name Classification Map

The `classifyToolEvent.js` utility determines tier based on `tool_name` from `tool_start` events:

```
Action (state-changing):
  - bash, shell, terminal, exec, run_command
  - write_file, edit_file, create_file, delete_file
  - git_commit, git_push

Research (read-only):
  - read_file, view_file, cat
  - grep, search, find, glob
  - list_directory, ls
  - get_*, fetch_*

Default: Action (safer to show than hide)
```

This list will grow as we discover more tool names from the Copilot SDK. The classifier should be data-driven (a config object, not a long if/else chain).

### Message Data Model Evolution

Current model: `{ role, content, id }` — flat list of text messages.

New model: **ordered stream of content blocks**:

```javascript
// A message is now a list of blocks
message = {
  id: "a-1234",
  role: "assistant",
  blocks: [
    { type: "text", content: "Let me check the build output." },
    { type: "tool", toolCallId: "tc-1", toolName: "bash", status: "complete", ... },
    { type: "tool-group", tools: [...], summary: "Read 3 files" },
    { type: "text", content: "The issue is in `src/api.js`..." }
  ],
  timestamp: 1711972498000
}
```

This is built incrementally as WebSocket events arrive:
- `assistant_delta` → append to last text block (or create new one)
- `tool_start` → append a new tool block
- `tool_complete` → update existing tool block's status
- `assistant_message` → finalize all text blocks

Research-tier tools are grouped into `tool-group` blocks when consecutive.

### Inline Placement

Tool events render **inline within the message stream**, between assistant text chunks. This matches how the WebSocket events actually arrive:

```
[User] Fix the build error

[Assistant] Let me check the build output.

  ┌ Running command: npm run build ────── ✓ 2.1s ┐
  └────────────────────────────────────────────────┘

  ┌ 📖 Read 2 files ──────────────────────────── ▸ ┐
  └──────────────────────────────────────────────────┘

[Assistant] The issue is in `src/api.js` line 42...
```

---

## Design: Chat Experience Polish

### 1. Markdown Rendering

Replace `whitespace-pre-wrap` plain text with `react-markdown` + `remark-gfm` + `rehype-highlight`.

**Supported elements:**
- Headings (h1-h6)
- Bold, italic, strikethrough
- Inline code and fenced code blocks with syntax highlighting
- Tables (GFM)
- Ordered/unordered lists, task lists
- Links (open in new tab)
- Blockquotes
- Horizontal rules

**Code block component:**
```
┌─ javascript ─────────────────── [Copy] ┐
│ function hello() {                      │
│   console.log("world");                 │
│ }                                       │
└─────────────────────────────────────────┘
```
- Language label top-left
- Copy button top-right
- Dark background (`#1a1c1a`) matching existing palette
- Monospace font (system default)
- Horizontal scroll for long lines

**Inline code:** Light brown background (`surface-container-high`), rounded, monospace.

### 2. Streaming Text Animation

Current behavior: text chunks concatenated, full re-render each delta.

New behavior:
- Append incoming deltas to a buffer
- Render markdown from the full buffer on each delta (react-markdown handles this)
- Cursor indicator (blinking `▌`) at end of streaming text
- Once `assistant_message` fires, remove cursor and finalize

**Performance note:** react-markdown re-parses on every render. For streaming, we accept this cost — messages are typically <10KB. If performance becomes an issue later, switch to incremental parsing.

### 3. Message Input UX

**Multi-line textarea:**
- Auto-resizes up to 6 lines, then scrolls internally
- `Enter` to send, `Shift+Enter` for newline
- Placeholder: "Ask Claude Cowork anything…"
- Disabled state while assistant is responding (with visual indicator)

**Keyboard shortcuts:**
- `Escape` — clear input
- `↑` (when input is empty) — edit last user message (stretch goal)

### 4. Conversation Flow

**Message grouping:**
- Consecutive messages from the same role are grouped
- Avatar shown only on first message in group
- Reduced spacing between grouped messages
- Timestamp shown on first message in group, or on hover for subsequent

**Timestamps:**
- Relative format: "just now", "2m ago", "1h ago"
- Full timestamp on hover (tooltip)
- Date dividers for messages on different days

**Typing indicator:**
- Three animated dots (bounce animation)
- Shown when `turn_started` fires, hidden on first `assistant_delta`
- Replaces current "Thinking…" text

### 5. Scroll Behavior

Replace naive `scrollTop = scrollHeight` with smart scrolling from ChatPrototype:

**Rules:**
- If user is within 100px of bottom → auto-scroll on new content
- If user has scrolled up → do NOT auto-scroll
- Show floating "↓ New messages" pill when new content arrives while scrolled up
- Clicking the pill smooth-scrolls to bottom
- Use `IntersectionObserver` on a sentinel element at bottom of messages

---

## Design: Component Architecture

### New Components to Create

```
src/
├── components/
│   ├── chat/
│   │   ├── MessageList.jsx        # Scrollable message container + smart scroll
│   │   ├── MessageBubble.jsx      # Single message (user or assistant)
│   │   ├── MessageGroup.jsx       # Groups consecutive same-role messages
│   │   ├── MarkdownContent.jsx    # react-markdown wrapper with custom renderers
│   │   ├── CodeBlock.jsx          # Fenced code block with copy + highlight
│   │   ├── TypingIndicator.jsx    # Animated dots
│   │   ├── ScrollPill.jsx         # "New messages ↓" floating button
│   │   └── ChatInput.jsx          # Auto-resizing textarea with send button
│   │
│   ├── tools/
│   │   ├── ToolEventCard.jsx      # Single tool execution card (action tier)
│   │   ├── ToolGroupSummary.jsx   # Collapsed research tier summary
│   │   ├── ToolStatusBadge.jsx    # Running/done/error indicator
│   │   └── PermissionCard.jsx     # Restyled permission approval (from PermissionBanner)
│   │
│   └── ui/
│       ├── cn.js                  # tailwind-merge + clsx utility
│       └── Collapsible.jsx        # base-ui Collapsible wrapper
│
├── hooks/
│   ├── useSmartScroll.js          # IntersectionObserver scroll logic
│   ├── useAutoResize.js           # Textarea auto-resize
│   └── useRelativeTime.js         # "2m ago" formatter
│
├── lib/
│   └── classifyToolEvent.js       # Classify events into action/research/meta tiers
```

### Refactoring ActiveSessionPage.jsx

The current 44KB monolith will be broken into:
- **ActiveSessionPage.jsx** — page-level layout, WebSocket connection, state management
- **MessageList** — extracted message rendering + scroll logic
- **ChatInput** — extracted input area
- **Tool components** — extracted from inline event handling

State stays in ActiveSessionPage via useState (no global state needed yet). Components receive props.

---

## Design: Visual Language

### Color Usage (existing palette, applied consistently)

| Element | Color Token | Hex |
|---------|------------|-----|
| User message bg | `surface-container-high` | `#ede0db` |
| Assistant message bg | `surface-container-low` | `#f7f2ef` |
| Code block bg | `on-surface` | `#1a1c1a` |
| Code block text | `surface` | `#faf9f6` |
| Tool card bg | `surface-container` | `#eee8e4` |
| Tool running | `primary` | `#99462A` |
| Tool success | `tertiary` | `#386664` |
| Tool error | `error` | `#ba1a1a` |
| Typing dots | `outline` | `#7c7570` |

### Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Message text | Manrope | 15px | 400 |
| Code blocks | System mono | 13px | 400 |
| Inline code | System mono | 14px | 500 |
| Timestamps | Manrope | 12px | 400 |
| Tool card title | Manrope | 13px | 600 |

### Spacing & Radius

- Message gap (same group): 4px
- Message gap (different group): 16px
- Tool card: rounded-xl (12px), padding 12px
- Code block: rounded-lg (8px), padding 16px

---

## Out of Scope

These are explicitly NOT part of this work:

- Dark mode (future)
- Electron packaging (future)
- Persistent storage / database (future)
- Authentication (future)
- Slash commands (future)
- MCP integration (future)
- Dashboard page redesign (WorkspacePage is fine for now)
- Mobile-specific optimizations beyond existing responsive layout
- Tests (should be added but is a separate effort)
- CI/CD setup

---

## Success Criteria

1. Assistant messages render markdown correctly (headings, lists, code blocks, tables, inline code, bold/italic)
2. Code blocks have syntax highlighting and a working copy button
3. Tool executions appear inline as cards with running/done/error states
4. Read-only tool events are grouped and collapsed by default
5. Smart scroll: doesn't interrupt reading, shows "new messages" pill
6. Typing indicator (animated dots) appears between user prompt and first response chunk
7. Textarea auto-resizes, supports Enter-to-send / Shift+Enter-for-newline
8. Streaming text shows a cursor indicator while in progress
9. Messages are visually grouped by role with proper avatar placement
10. ActiveSessionPage is decomposed into focused components (<300 lines each)
