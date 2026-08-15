# pocketwire — Design Document

> Control and monitor coding agents (opencode, Claude Code, Cursor, and more) from your phone.

## 1. Goals

1. **Send to phone:** detailed, short, precise output + screenshots from any CLI coding agent.
2. **Receive from phone:** prompts, steering, approvals, and skill invocations at any time.
3. **Universal:** works with opencode (deep), any MCP-capable agent, and eventually any plain CLI.
4. **Private:** local-first, token + PIN auth, exposed only over Tailscale.

## 2. Non-goals

- Not a cloud SaaS. No agent code runs on the phone.
- Not a replacement for the terminal — it is a companion remote.

## 3. Components

### 3.1 Relay core (`packages/core`)

- **Event bus:** in-process pub/sub that every adapter and the server subscribe to.
- **Event store:** ring buffer of the last N events, persisted to disk (JSON or SQLite) so the phone can replay history.
- **Queues:**
  - *instruction queue* — prompts from phone destined for the agent;
  - *approval queue* — pending permission/control requests awaiting a phone response;
  - *response queue* — answers the phone gave for `ask_user` / approvals.
- **Auth:** bearer tokens per phone; optional PIN; API key for the relay↔adapter link.
- **Push notifier:** ntfy client (topic per install, configurable server, default `ntfy.sh`). Priority-aware, markdown body, optional image attachments.

### 3.2 Server (`packages/server`)

- HTTP + WebSocket + SSE.
- REST endpoints for the PWA:
  - `GET /api/events` (SSE) · `GET /ws` (WebSocket)
  - `POST /api/prompt` — enqueue a prompt for an agent/session
  - `POST /api/command` — run a slash command / skill
  - `POST /api/approve` · `POST /api/deny` — respond to a permission/control request
  - `POST /api/abort` — cancel the current run
  - `POST /api/screenshot` — request a capture
  - `GET /api/skills` · `GET /api/sessions` · `GET /api/todos` · `GET /api/diff` · `GET /api/status`
- Serves the compiled PWA.

### 3.3 opencode adapter (`packages/adapter-opencode`)

Discovers and connects to an `opencode serve` instance (fixed `--port`), then:

| opencode API | Use |
| --- | --- |
| `GET /event` (SSE) | normalize → relay bus (session.updated, message.part.updated, tool.execute, session.idle, permission requests) |
| `GET /command` | list skills/commands → phone skill picker |
| `POST /session/:id/prompt_async` | inject phone prompts into the running session |
| `POST /session/:id/command` | run slash commands / skills |
| `POST /session/:id/permissions/:permissionID` | approve/deny from phone |
| `POST /session/:id/abort` | stop the run |
| `GET /session/:id/todo` · `GET /session/:id/diff` | todos and diff panels |

Active-session detection via `/session/status` + `/path/current`; multi-session switcher.

### 3.4 MCP server (`packages/mcp`)

stdio server exposing tools any MCP-capable agent can call:

| Tool | Purpose |
| --- | --- |
| `notify(title, message, priority?)` | push a short alert to the phone (ntfy + feed) |
| `send_output(text, {summarize?, max_lines?, title?})` | stream output; truncated, precise |
| `send_screenshot(path? \| capture_mode)` | capture screen or forward a file/image to the phone |
| `ask_user(question, options?)` | **block** until the phone answers; returns choice or typed text |
| `get_instruction(wait_seconds?)` | return the next queued phone instruction, or null (mid-run steering) |
| `list_skills()` | catalog skills from `~/.agents/skills`, `~/.config/opencode/skills`, project `.opencode/skills`, `~/.config/opencode/command` |
| `report_done(summary, {files_changed?})` | completion summary + optional diff to phone |

Registered in `opencode.jsonc` and via `claude mcp add`.

### 3.5 Web PWA (`packages/web`)

Vanilla JS single-page app, no build step, service worker + manifest for installability. Mobile-first, dark theme.

Panels:
- Live activity feed (ANSI-rendered output, tool calls, errors, inline screenshots)
- Prompt box + slash-command / skill chips
- Quick actions: Continue · Approve · Deny · Stop (Abort)
- Screenshot viewer + request button
- Session switcher · todos · diffs
- Approval UI (allow once / always / deny)
- Status bar: connected agent, session, ntfy status, Tailscale link

### 3.6 Config & ops

- `pocketwire.json` — port, tokens, ntfy topic/server, skill dirs, screenshot tool, remote command allowlist.
- `setup.sh` — install deps, build, generate token, print PWA URL + Tailscale instructions, optional systemd user service.
- systemd user unit for the relay.

## 4. Data flows

- **Monitoring:** agent → `notify`/`send_output` (MCP) or opencode event → relay → ntfy push (short) + feed (full).
- **Control:** phone → `POST /api/prompt` → relay queue → opencode `prompt_async` (or agent `get_instruction` poll).
- **Approval:** opencode permission request → adapter → relay → phone UI → tap → adapter → `permissions/:id`.
- **Skills:** phone picker → `/command` or `list_skills` → execute as slash command with prompt.
- **Screenshot:** phone button → relay → screen capture (scrot/grim) or forwarded image → phone.

## 5. Security

- Bind `127.0.0.1` by default; reachable only via Tailscale.
- Bearer token + optional PIN on the PWA.
- Remote commands gated by allowlist. Raw shell disabled remotely by default.

## 6. Roadmap

- [x] Idea + architecture (this doc)
- [ ] Phase 0–1: monorepo scaffold, relay core, server, auth, ntfy push
- [ ] Phase 2: phone PWA
- [ ] Phase 3: opencode adapter
- [ ] Phase 4: MCP server + wiring
- [ ] Phase 5: setup, systemd, Tailscale docs, hardening
- [ ] Phase 6: Telegram add-on + PTY wrapper
