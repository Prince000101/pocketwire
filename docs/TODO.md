# pocketwire — Todo / Roadmap

Live task list. Checked items are merged into `main`.

## Phase 0–1 — Relay foundation
- [x] Monorepo scaffold (npm workspaces, TypeScript, tsconfig base)
- [x] Config loader (`pocketwire.json` + env)
- [x] Logging (structured, level-gated)
- [x] Event bus + typed events
- [x] Event store (ring buffer, persisted)
- [x] Instruction / approval / response queues
- [x] Auth (bearer token + optional PIN)
- [x] ntfy push notifier (priority, markdown, image attachments)
- [x] HTTP + WebSocket + SSE API (`/api/events`, `/api/prompt`, `/api/command`, `/api/approve`, `/api/abort`, `/api/screenshot`, `/api/skills`, `/api/status`, `/api/approvals`, `/api/history`)
- [x] Basic `pocketwire` CLI to start the relay

## Phase 2 — Phone PWA
- [x] Static app shell (vanilla JS, dark theme, mobile-first)
- [x] Live activity feed with ANSI rendering
- [x] Prompt box + send
- [x] Skill / slash-command picker
- [x] Quick actions: Continue · Approve · Deny · Stop
- [x] Approval UI (allow once / always / deny)
- [x] Screenshot viewer + request button
- [x] Service worker + manifest (installable)
- [ ] Session switcher, todos, diff panels (normalized into feed in v0.3)

## Phase 3 — opencode adapter
- [x] Discover / connect to `opencode serve`
- [x] SSE event normalization → relay bus
- [x] Prompt injection (`prompt_async`)
- [x] Slash commands & skills (`/command`)
- [x] Permission approve/deny (`/permissions/:id`, with remember)
- [x] Abort · todos · diffs
- [ ] Multi-session switcher (auto-selects most recent session today)

## Phase 4 — MCP server
- [x] `notify`, `send_output`, `send_screenshot`, `ask_user`, `get_instruction`, `list_skills`, `report_done`
- [x] Registered in `opencode.jsonc`
- [ ] `claude mcp add` instructions

## Phase 5 — Ops & hardening
- [ ] `setup.sh`
- [ ] systemd user service
- [ ] Tailscale setup docs
- [ ] Remote command allowlist
- [ ] README quick-start complete

## Phase 6 — Stretch
- [ ] Telegram bot add-on
- [ ] PTY wrapper for any CLI (`pocketwire run -- <cmd>`)
