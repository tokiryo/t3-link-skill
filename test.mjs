// Self-check in a throwaway HOME: node test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "t3-link-skill-"));
const write = (p, s) => (fs.mkdirSync(path.dirname(p), { recursive: true }), fs.writeFileSync(p, s));
write(path.join(home, "src/demo/SKILL.md"), "---\nname: demo\n---\n");
write(path.join(home, ".t3/userdata/settings.json"), JSON.stringify({
  providerInstances: {
    antigravity: { driver: "antigravity", enabled: true },
    pi: { driver: "pi", enabled: true },
    "pi-zai": { driver: "pi", enabled: true, environment: [{ name: "PI_CODING_AGENT_DIR", value: path.join(home, ".pi/agent-zai") }] },
    "pi-shared": { driver: "pi", enabled: true },
    opencode: { driver: "opencode", enabled: false },
    kiro: { driver: "kiro", enabled: true },
  },
}));
// Stand-ins for the harness CLIs: log the call, then write the entry where the real CLI would.
const log = path.join(home, "calls.log");
write(path.join(home, "bin/fake.mjs"), `#!${process.execPath}
import fs from "node:fs"; import path from "node:path";
const tool = path.basename(process.argv[1]), args = process.argv.slice(2), name = args.find((a, i) => i > 1 && !a.startsWith("-") && !args[i - 1].startsWith("--"));
fs.appendFileSync(${JSON.stringify(log)}, [tool, process.env.PI_CODING_AGENT_DIR ?? "-", ...args].join(" ") + "\\n");
const H = process.env.HOME, json = (f) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ mcpServers: { [name]: {} } })); };
if (tool === "pi") json(path.join(process.env.PI_CODING_AGENT_DIR ?? H + "/.pi/agent", "mcp.json"));
if (tool === "agy") json(H + "/.gemini/config/mcp_config.json");
if (tool === "codex") { fs.mkdirSync(H + "/.codex", { recursive: true }); fs.appendFileSync(H + "/.codex/config.toml", "[mcp_servers." + name + "]\\n"); }
`);
for (const t of ["claude", "codex", "pi", "agy"]) fs.copyFileSync(path.join(home, "bin/fake.mjs"), path.join(home, "bin", t)), fs.chmodSync(path.join(home, "bin", t), 0o755);
write(path.join(home, ".claude.json"), JSON.stringify({ mcpServers: { tool: { type: "stdio", command: "node", args: ["/x/server.mjs", "--flag"], env: { A: "1" } } } }));

const run = (mode, instances, ...extra) => {
  write(path.join(home, "config.json"), JSON.stringify({ mode, instances }));
  const skill = extra.includes("--no-skill") ? [] : [path.join(home, "src/demo")];
  return execFileSync(process.execPath, [new URL("link.mjs", import.meta.url).pathname, ...skill, ...extra.filter((e) => e !== "--no-skill")], {
    env: { ...process.env, HOME: home, PATH: `${path.join(home, "bin")}:${process.env.PATH}`, T3CODE_HOME: path.join(home, ".t3"), T3_LINK_SKILL_CONFIG: path.join(home, "config.json"), PI_CODING_AGENT_DIR: "/must/not/be/used" },
    encoding: "utf8",
  });
};
const linked = (p) => fs.existsSync(path.join(home, p, "demo/SKILL.md"));

let out = run("deny", ["pi"], "--dry-run");
assert.match(out, /claudeAgent \(claudeAgent\): would link/);
assert.ok(!linked(".claude/skills"));

out = run("deny", ["pi"]);
assert.ok(linked(".claude/skills") && linked(".codex/skills") && linked(".pi/agent-zai/skills"));
assert.match(out, /pi \(pi\): excluded/);
assert.match(out, /pi-shared \(pi\): skill skipped, .* shared with an excluded instance/); // same ~/.pi/agent as pi
assert.ok(!linked(".pi/agent/skills"));
assert.match(out, /kiro \(kiro\): skill skipped, no known skills folder/);
assert.doesNotMatch(out, /opencode/); // disabled
assert.match(run("deny", ["pi"]), /claudeAgent \(claudeAgent\): skill already there/);

assert.match(run("allow", ["pi"]), /pi \(pi\): skill skipped, .* shared/); // pi-shared would see it too
out = run("allow", ["pi", "pi-shared"]);
assert.match(out, /pi \(pi\): linked/);
assert.match(out, /codex \(codex\): excluded/);
assert.ok(linked(".pi/agent/skills"));

assert.throws(() => run("some", []));

// --mcp copies the Claude Code entry with each CLI; nothing runs without the option.
assert.ok(!fs.existsSync(log));
out = run("deny", ["pi"], "--no-skill", "--mcp=tool");
assert.match(out, /claudeAgent \(claudeAgent\): mcp tool already in/);
assert.match(out, /pi-shared \(pi\): mcp skipped, .* shared with an excluded instance/);
const calls = fs.readFileSync(log, "utf8");
assert.match(calls, /^codex \S+ mcp add tool --env A=1 -- node \/x\/server\.mjs --flag$/m);
assert.match(calls, new RegExp(`^pi ${home}/\\.pi/agent-zai mcp add tool --env A=1 -- node /x/server\\.mjs --flag$`, "m"));
assert.match(calls, /^agy \S+ mcp add --env A=1 tool -- node \/x\/server\.mjs --flag$/m);
assert.doesNotMatch(calls, /^pi (-|\/must)/m); // never the excluded default folder, never this process's variable
assert.match(run("deny", ["pi"], "--no-skill", "--mcp=tool"), /codex \(codex\): mcp tool already in/);
assert.throws(() => run("all", [], "--no-skill", "--mcp=missing"));
fs.rmSync(home, { recursive: true });
console.log("ok");
