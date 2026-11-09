# t3-link-skill

Make one skill (and, optionally, one MCP server) available to every agent harness registered in
[T3 Code](https://github.com/pingdotgg/t3code): Claude Code, Codex, each Pi instance, Antigravity, OpenCode and fx.
An allow list or deny list leaves out the instances you choose.

It reads the provider instances from T3 Code's settings, works out each one's user skills folder
(following the per-instance variables T3 sets, such as `PI_CODING_AGENT_DIR`), and symlinks the skill folder there.
With `--mcp`, it copies a server you registered in Claude Code to the other harnesses with their own CLIs.

One file, Node 18+, no dependencies.

## Install
As a Claude Code skill:
```sh
git clone https://github.com/tokiryo/t3-link-skill ~/.claude/skills/t3-link-skill
```
`SKILL.md` tells the agent to compare the plan with what T3 Code reports before linking anything.

## Use
```sh
node link.mjs <skill-folder> --dry-run             # show where the skill would go
node link.mjs <skill-folder>                       # link it
node link.mjs <skill-folder> --mcp=<server> --dry-run   # also copy a Claude Code MCP server
node link.mjs --mcp=<server>                       # only the MCP server
```

## Choose the instances
Copy `config.example.json` to `config.json` (kept out of git). Without it, every enabled instance is used.
```json
{ "mode": "deny", "instances": ["pi"] }
```
- `mode`: `all`, `allow` (only `instances`), or `deny` (all but `instances`).
- `instances`: T3 provider instance ids, such as `claudeAgent`, `codex`, `pi`, `antigravity`,
  or the ids of instances you added (the keys of `providerInstances` in `~/.t3/userdata/settings.json`).

## Where it writes
| Driver | Skills | MCP (with `--mcp`) |
|---|---|---|
| Claude Code | `~/.claude/skills` (`CLAUDE_CONFIG_DIR`) | `claude mcp add-json -s user` |
| Codex | `~/.codex/skills` (`CODEX_HOME`) | `codex mcp add` |
| Pi | `~/.pi/agent/skills` (`PI_CODING_AGENT_DIR`) | `pi mcp add` → `mcp.json` in the same folder |
| Antigravity | `~/.gemini/config/skills` | `agy mcp add` → `~/.gemini/config/mcp_config.json` |
| OpenCode | `~/.config/opencode/skills` | - |
| fx | `~/.fx/skills` | - |

A variable in brackets counts only when T3 sets it for that instance, not when it happens to be set in the shell
running the script.

## Rules
- Only enabled instances. Instances of drivers with no known folder (Cursor, Grok, Kiro, Muse) are listed and skipped.
- A folder or config file that an excluded instance also uses is left alone, so the exclusion holds.
- Nothing is overwritten: an existing entry with the same name is reported and skipped (exit code 1).
- Shared folders such as `~/.agents/skills` are never written: several harnesses (Pi among them) read it,
  so a skill there would reach excluded instances too.
- `--mcp` copies stdio and http servers only, including their `env` and headers (secrets included).
  Harness-specific settings such as Codex's `tool_timeout_sec` are not copied.

## Limits
- The folders come from each harness's conventions and code, not from T3 Code, which keeps no such list.
  The Antigravity paths and Pi reading `~/.agents/skills` were taken from their code and not tested by loading a skill.
- Only this machine's instances. Other environments linked in T3 Code are not touched.

## Test
```sh
node test.mjs
```
Runs in a throwaway `HOME`, with stand-ins for the harness CLIs.
