#!/usr/bin/env node
// Link a skill folder, and optionally an MCP server, into every harness registered in T3 Code,
// filtered by config.json (mode all | allow | deny, plus instance ids).
//   node link.mjs [<skill-folder>] [--mcp=<server>] [--dry-run]
// --mcp copies the server's user-level entry from Claude Code (~/.claude.json) with each harness's own CLI.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const HOME = os.homedir();
const here = path.dirname(new URL(import.meta.url).pathname);
const t3Home = process.env.T3CODE_HOME ?? path.join(HOME, ".t3");
const configPath = process.env.T3_LINK_SKILL_CONFIG ?? path.join(here, "config.json");
const expand = (p) => (p.startsWith("~/") ? path.join(HOME, p.slice(2)) : p);
const readText = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };
const readJson = (f) => JSON.parse(readText(f).trim() || "{}");
const pairs = (o = {}, flag, sep = "=") => Object.entries(o).flatMap(([k, v]) => [flag, `${k}${sep}${v}`]);

// Per T3 driver: its config folder (and the variable that moves it), user skills folder, and MCP config.
// Only the instance's own T3 environment counts, not this process's: a variable like
// PI_CODING_AGENT_DIR here belongs to whichever harness runs the script.
const DRIVERS = {
  claudeAgent: {
    home: "~/.claude", variable: "CLAUDE_CONFIG_DIR",
    mcp: {
      file: (home, env) => (env.CLAUDE_CONFIG_DIR ? path.join(home, ".claude.json") : path.join(HOME, ".claude.json")),
      has: (file, name) => !!readJson(file).mcpServers?.[name],
      add: (name, s) => ["claude", ["mcp", "add-json", "-s", "user", name, JSON.stringify(s)]],
    },
  },
  codex: {
    home: "~/.codex", variable: "CODEX_HOME",
    mcp: {
      file: (home) => path.join(home, "config.toml"),
      has: (file, name) => readText(file).split("\n").some((l) => [`[mcp_servers.${name}]`, `[mcp_servers."${name}"]`].includes(l.trim())),
      add: (name, s) =>
        s.url ? (s.headers && Object.keys(s.headers).length ? null : ["codex", ["mcp", "add", name, "--url", s.url]])
          : ["codex", ["mcp", "add", name, ...pairs(s.env, "--env"), "--", s.command, ...(s.args ?? [])]],
    },
  },
  pi: {
    home: "~/.pi/agent", variable: "PI_CODING_AGENT_DIR",
    mcp: {
      file: (home) => path.join(home, "mcp.json"),
      has: (file, name) => !!readJson(file).mcpServers?.[name],
      add: (name, s) =>
        s.url ? ["pi", ["mcp", "add", name, "--url", s.url, ...pairs(s.headers, "--header")]]
          : ["pi", ["mcp", "add", name, ...pairs(s.env, "--env"), "--", s.command, ...(s.args ?? [])]],
    },
  },
  antigravity: {
    home: "~/.gemini/config",
    mcp: {
      file: (home) => path.join(home, "mcp_config.json"),
      has: (file, name) => !!readJson(file).mcpServers?.[name],
      // agy takes its flags before the name.
      add: (name, s) =>
        s.url ? ["agy", ["mcp", "add", ...pairs(s.headers, "--header", ": "), name, s.url]]
          : ["agy", ["mcp", "add", ...pairs(s.env, "--env"), name, "--", s.command, ...(s.args ?? [])]],
    },
  },
  opencode: { home: "~/.config/opencode" },
  fx: { home: "~/.fx" },
};
// shortcut: T3 enables these built-in instances without a settings entry (others stay off); re-check if T3 changes its defaults.
const DEFAULT_ON = ["claudeAgent", "codex"];

function fail(message) {
  console.error(`t3-link-skill: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const mcpName = args.find((a) => a.startsWith("--mcp="))?.slice(6);
const source = args.find((a) => !a.startsWith("--"));
if (!source && !mcpName) fail("usage: node link.mjs [<skill-folder>] [--mcp=<server>] [--dry-run]");
const src = source && fs.realpathSync(expand(source));
if (src && !fs.existsSync(path.join(src, "SKILL.md"))) fail(`${src} has no SKILL.md`);

let server;
if (mcpName) {
  server = readJson(path.join(HOME, ".claude.json")).mcpServers?.[mcpName];
  if (!server) fail(`no user-level MCP server named ${mcpName} in ~/.claude.json (claude mcp add --scope user ...)`);
  if (!["stdio", "http", undefined].includes(server.type)) fail(`${mcpName} is a ${server.type} server; only stdio and http are copied`);
}

// No config.json (it is per machine and not in git) means every instance.
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : { mode: "all" };
if (!["all", "allow", "deny"].includes(config.mode)) fail(`${configPath}: mode must be all, allow or deny`);
const listed = new Set(config.instances ?? []);
const wanted = (id) => config.mode === "all" || (config.mode === "allow" ? listed.has(id) : !listed.has(id));

// Every enabled instance T3 knows: its settings entries plus the built-in defaults it has no entry for.
const settings = JSON.parse(fs.readFileSync(path.join(t3Home, "userdata/settings.json"), "utf8"));
const instances = Object.entries(settings.providerInstances ?? {}).map(([id, i]) => ({
  id,
  driver: i.driver ?? id,
  enabled: i.enabled !== false,
  env: Object.fromEntries((i.environment ?? []).map((e) => [e.name, e.value])),
}));
for (const id of DEFAULT_ON) if (!instances.some((i) => i.id === id)) instances.push({ id, driver: id, enabled: true, env: {} });
const active = instances.filter((i) => i.enabled).map((i) => {
  const d = DRIVERS[i.driver];
  const home = d && expand((d.variable && i.env[d.variable]) || d.home);
  return { ...i, d, home, skills: home && path.join(home, "skills"), mcpFile: d?.mcp && d.mcp.file(home, i.env) };
});
for (const id of listed) if (!active.some((i) => i.id === id)) console.log(`note: ${id} in config.json is not an enabled T3 instance`);

// A folder or file shared with an excluded instance is left alone, or the exclusion would leak.
const excluded = active.filter((i) => !wanted(i.id));
const blockedSkills = new Set(excluded.map((i) => i.skills).filter(Boolean));
const blockedMcp = new Set(excluded.map((i) => i.mcpFile).filter(Boolean));
let failed = false;

function linkSkill(i, label) {
  if (!i.skills) return console.log(`${label}: skill skipped, no known skills folder for driver ${i.driver}`);
  if (blockedSkills.has(i.skills)) return console.log(`${label}: skill skipped, ${i.skills} is shared with an excluded instance`);
  const dest = path.join(i.skills, path.basename(src));
  let existing;
  try { existing = fs.lstatSync(dest); } catch {}
  if (existing) {
    const same = (() => { try { return fs.realpathSync(dest) === src; } catch { return false; } })();
    failed ||= !same;
    return console.log(same ? `${label}: skill already there, ${dest}` : `${label}: skill skipped, ${dest} already holds something else`);
  }
  if (dryRun) return console.log(`${label}: would link ${dest}`);
  fs.mkdirSync(i.skills, { recursive: true });
  fs.symlinkSync(src, dest);
  console.log(`${label}: linked ${dest}`);
}

function addMcp(i, label) {
  if (!i.mcpFile) return console.log(`${label}: mcp skipped, no known MCP config for driver ${i.driver}`);
  if (blockedMcp.has(i.mcpFile)) return console.log(`${label}: mcp skipped, ${i.mcpFile} is shared with an excluded instance`);
  if (i.d.mcp.has(i.mcpFile, mcpName)) return console.log(`${label}: mcp ${mcpName} already in ${i.mcpFile}`);
  const cmd = i.d.mcp.add(mcpName, server);
  if (!cmd) { failed = true; return console.log(`${label}: mcp skipped, its CLI cannot take this server's headers`); }
  if (dryRun) return console.log(`${label}: would add to ${i.mcpFile}: ${[cmd[0], ...cmd[1]].join(" ")}`);
  const env = { ...process.env };
  if (i.d.variable) { delete env[i.d.variable]; if (i.env[i.d.variable]) env[i.d.variable] = i.env[i.d.variable]; }
  const r = spawnSync(cmd[0], cmd[1], { env, encoding: "utf8" });
  const ok = r.status === 0 && i.d.mcp.has(i.mcpFile, mcpName);
  failed ||= !ok;
  console.log(ok ? `${label}: mcp ${mcpName} added to ${i.mcpFile}` : `${label}: mcp failed: ${(r.error?.message ?? r.stderr ?? "").trim() || `not found in ${i.mcpFile}`}`);
}

for (const i of active) {
  const label = `${i.id} (${i.driver})`;
  if (!wanted(i.id)) { console.log(`${label}: excluded`); continue; }
  if (src) linkSkill(i, label);
  if (mcpName) addMcp(i, label);
}
process.exit(failed ? 1 : 0);
