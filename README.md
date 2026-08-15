# pocketwire

Control and monitor your coding agents (opencode, Claude Code, Cursor, and more) from your phone.

- **Live activity feed** — every step, tool call, error, and result streams to your phone.
- **Push alerts** — short, precise summaries via [ntfy](https://ntfy.sh), even over cellular.
- **Prompt from anywhere** — type a message on your phone and it is injected into a *running* session.
- **Approve / deny** — answer permission requests (allow once, always, deny) from the couch.
- **Skills & slash commands** — browse your available skills (`/systematic-debugging`, superpowers, etc.) and trigger them with a prompt.
- **Screenshots** — request a capture of the terminal / screen, or forward agent-generated images, straight to your phone.
- **Private by default** — binds to `127.0.0.1`, exposed only over Tailscale, token + PIN protected.

## Quick start

```bash
# 1. install
git clone https://github.com/Prince000101/pocketwire && cd pocketwire
./scripts/setup.sh        # deps, config (~/.config/pocketwire/pocketwire.json), optional systemd service

# 2. start the agents you want to control
opencode serve --port 4096     # deep opencode integration
#   + add the MCP server to opencode (~/.config/opencode/opencode.jsonc):
#   "pocketwire": { "type": "local", "command": ["node", "/abs/path/pocketwire/node_modules/tsx/dist/cli.mjs", "/abs/path/pocketwire/packages/mcp/src/index.ts"] }

# 3. start the relay
npm start                       # or: systemctl --user start pocketwire.service

# 4. open the phone app
#    same Wi-Fi: http://<pc-ip>:8787   ·   remote: https://<tailscale-host>.ts.net (see below)
#    copy the token from the relay log into the PWA
```

**Remote access (Tailscale, recommended):** install Tailscale on the PC and your phone, sign into the same tailnet, then run `tailscale serve --bg 8787` (or `tailscale funnel --bg 8787` for public sharing). Open `https://<pc-host>.ts.net` on the phone. The relay still only listens on `127.0.0.1` — Tailscale is the only path in.

**Push alerts (ntfy):** set `"ntfy": { "topic": "<your-topic>" }` in the config (optionally a self-hosted `"server"`). Install [ntfy](https://ntfy.sh) on your phone and subscribe to the topic; the PWA picks up pushes automatically.

**Hardening:** set `"pin"` for a second factor, and limit which slash commands the phone may trigger with `"allowCommands": ["review", "test"]` (unset = all registered commands/skills allowed).

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

Register it with any MCP client, e.g.:

```bash
# Claude Code
claude mcp add pocketwire -- node /abs/path/pocketwire/node_modules/tsx/dist/cli.mjs /abs/path/pocketwire/packages/mcp/src/index.ts
# Cursor / Windsurf: add a stdio MCP server with the same command
```

The server reads the relay address and bearer token from `~/.config/pocketwire/pocketwire.json` + `~/.pocketwire/.token`, so it works from any project directory once the relay is running.

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
