# pocketwire — Todo / Roadmap

Live task list. Checked items are merged into `main`.

## Phase 0–1 — Relay foundation
- [ ] Monorepo scaffold (npm workspaces, TypeScript, tsconfig base)
- [ ] Config loader (`pocketwire.json` + env)
- [ ] Logging (structured, level-gated)
- [ ] Event bus + typed events
- [ ] Event store (ring buffer, persisted)
- [ ] Instruction / approval / response queues
- [ ] Auth (bearer token + optional PIN)
- [ ] ntfy push notifier (priority, markdown, image attachments)
- [ ] HTTP + WebSocket + SSE API (`/api/events`, `/api/prompt`, `/api/command`, `/api/approve`, `/api/deny`, `/api/abort`, `/api/screenshot`, `/api/skills`, `/api/sessions`, `/api/todos`, `/api/diff`, `/api/status`)
- [ ] Basic `pocketwire` CLI to start the relay

## Phase 2 — Phone PWA
- [ ] Static app shell (vanilla JS, dark theme, mobile-first)
- [ ] Live activity feed with ANSI rendering
- [ ] Prompt box + send
- [ ] Skill / slash-command picker
- [ ] Quick actions: Continue · Approve · Deny · Stop
- [ ] Approval UI (allow once / always / deny)
- [ ] Screenshot viewer + request button
- [ ] Session switcher, todos, diff panels
- [ ] Service worker + manifest (installable)

## Phase 3 — opencode adapter
- [ ] Discover / connect to `opencode serve`
- [ ] SSE event normalization → relay bus
- [ ] Prompt injection (`prompt_async`)
- [ ] Slash commands & skills (`/command`)
- [ ] Permission approve/deny (`/permissions/:id`)
- [ ] Abort · todos · diffs
- [ ] Multi-session switcher

## Phase 4 — MCP server
- [ ] `notify`, `send_output`, `send_screenshot`, `ask_user`, `get_instruction`, `list_skills`, `report_done`
- [ ] Register in `opencode.jsonc`
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
