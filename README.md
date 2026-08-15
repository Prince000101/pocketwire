# pocketwire

Control and monitor your coding agents (opencode, Claude Code, Cursor, and more) from your phone.

- **Live activity feed** — every step, tool call, error, and result streams to your phone.
- **Push alerts** — short, precise summaries via [ntfy](https://ntfy.sh), even over cellular.
- **Prompt from anywhere** — type a message on your phone and it is injected into a *running* session.
- **Approve / deny** — answer permission requests (allow once, always, deny) from the couch.
- **Skills & slash commands** — browse your available skills (`/systematic-debugging`, superpowers, etc.) and trigger them with a prompt.
- **Screenshots** — request a capture of the terminal / screen, or forward agent-generated images, straight to your phone.
- **Private by default** — binds to `127.0.0.1`, exposed only over Tailscale, token + PIN protected.

## Architecture

```
 Phone                        PC (localhost)                              Coding agents
┌─────────┐      HTTPS/WS     ┌────────────────────────────────────────┐   ┌─────────────┐
│ Web PWA │◄─────Tailscale───►│  pocketwire relay                      │◄─►│ opencode     │
│ +ntfy   │      + token      │  ├─ core: bus · queues · store · auth  │API│  (deep)      │
│ push    │                   │  ├─ server: HTTP + WS + SSE + PWA      │   │ Claude Code │
└────┬────┘                   │  ├─ adapter-opencode (serve API)       │   │ Cursor ...  │
     │ ntfy.sh (alerts)       │  └─ mcp-server (stdio tools) ◄─────────┘   └─────────────┘
```

The relay speaks three integration dialects so it works with opencode deeply **and** with any other agent:

### 1. opencode adapter (deep integration)
Connects to the headless `opencode serve` API for:
- Real-time event streaming (`/event` SSE)
- Prompt injection into a running session (`/session/:id/prompt_async`)
- Slash commands & skills (`/session/:id/command`, `/command`)
- Permission approve/deny from the phone (`/session/:id/permissions/:id`)
- Abort, todos, and diffs

Enabled by setting `opencode.serverUrl` in `pocketwire.json` (defaults to `http://127.0.0.1:4096`). Start opencode with `opencode serve --port 4096` on the same machine; if a server password is set, export `OPENCODE_SERVER_PASSWORD`. The adapter auto-selects the most recently active session, and events normalize into feed items (text streams, tool runs, approvals, idle/error pushes).

### 2. MCP server (any MCP-capable agent)
A stdio MCP server exposing tools any agent (Claude Code, Cursor, Windsurf, opencode) can call:
`notify`, `send_output` (short/precise, truncated), `send_screenshot`, `ask_user` (blocks until the phone answers), `get_instruction` (phone steering mid-run), `list_skills`, `report_done`.

### 3. PTY wrapper *(roadmap)*
`pocketwire run -- claude` — a generic wrapper for plain CLIs with no MCP/server support.

## Key flows

- **Monitoring:** agent finishes a step → `notify`/`send_output` or an opencode event → relay → ntfy push (short summary) + live feed. Open the PWA for full detail / screenshots.
- **Control:** type a prompt on your phone → PWA → relay queue → opencode `prompt_async` into the active session (or the agent polls `get_instruction`).
- **Approvals:** opencode raises a permission request → relay relays it → phone shows **Allow once / Always / Deny** → tap → relay answers via `/session/:id/permissions/:id`.
- **Skills:** phone opens the picker → `GET /command` (opencode) or `list_skills` (scans `~/.agents/skills`, `~/.config/opencode/skills`, `~/.config/opencode/command`) → tap a skill → executes as a slash command with your prompt.
- **Screenshots:** phone button → relay → captures the screen (scrot on X11 / grim on Wayland) or forwards agent-generated images.

## Repository layout

```
packages/
  core/                 # event bus, queues, event store, auth, ntfy push
  server/               # HTTP + WebSocket + SSE API, serves the PWA
  adapter-opencode/     # opencode serve API integration
  mcp/                  # MCP server exposing tools to any agent
  web/                  # phone PWA (vanilla JS, installable)
docs/
  DESIGN.md             # full design document
  TODO.md               # roadmap / task list
```

## Phases

| Phase | What | Status |
|-------|------|--------|
| 0–1   | Monorepo scaffold + relay core + server + auth + ntfy push | done |
| 2     | Phone PWA (feed, prompt, skills, actions, approvals, screenshots) | done |
| 3     | opencode adapter (events, prompt injection, commands, approvals, abort) | done |
| 4     | MCP server tools, wired into `opencode.jsonc` / `claude mcp add` | mostly done |
| 5     | `setup.sh`, systemd service, Tailscale docs, hardening | todo |
| 6     | Telegram add-on + PTY wrapper for any CLI | stretch |

## Security posture

- Binds to `127.0.0.1` by default; reachable only via **Tailscale**.
- Phone access requires a bearer token, optionally a PIN.
- Remote-initiated commands are gated by an **allowlist** (prompts + skills OK; raw shell off by default).

## License

MIT
