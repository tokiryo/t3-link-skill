---
name: t3-link-skill
description: Link a skill folder (and, with --mcp, an MCP server) into the user skills folder of every harness registered in T3 Code (Claude Code, Codex, every Pi setup, Antigravity, OpenCode, fx), with an all / allow-list / deny-list filter in config.json. Use when the user asks to make a skill available to the T3 harnesses, e.g. "このスキルを全ハーネスにリンクして", "t3のハーネスにスキルを入れて", "スキルを他のエージェントでも使えるようにして", "link this skill to all agents".
---

# t3-link-skill

T3 Code に登録されているハーネスを `~/.t3/userdata/settings.json` から読み、
それぞれのユーザー用スキルフォルダに、スキルフォルダへのシンボリックリンクを作る。

## 使い方（毎回この順で）
スクリプトのハーネス一覧とフォルダの割り当ては、T3 の今の登録と食い違うことがある（インスタンスの追加・無効化、
T3 の既定の変更）。だから実行の前に、必ず T3 側を見て照らし合わせる。

1. **T3 側を確認する。** 次の2つを見る。
   - T3 の MCP ツール `orchestrator_capabilities` の `providers`: 各 `providerInstanceId`・`displayName`・有効かどうか
     （`constraints` に `Provider instance is disabled.` があれば無効）。ツールが無いハーネスで動いているなら、そう伝えて設定ファイルだけで進める。
   - 各インスタンスの環境変数（スキルや設定の置き場所を動かすもの）:
     ```
     python3 -c 'import json,os;d=json.load(open(os.path.expanduser("~/.t3/userdata/settings.json")))
     for k,v in d.get("providerInstances",{}).items(): print(k, v.get("driver",k), "enabled" if v.get("enabled",True) else "disabled", {e["name"]:e["value"] for e in v.get("environment",[])})'
     ```
2. **試しに実行する。** `node ~/.claude/skills/t3-link-skill/link.mjs <スキルフォルダ> [--mcp=<サーバー名>] --dry-run`
3. **照らし合わせる。** 1 と 2 を並べて、次を全部確かめる。
   - T3 で有効なインスタンスが、試しの実行の出力に1つ残らず出ている。無効なものは出ていない。
   - 各行のフォルダ（`would link …`）と設定ファイル（`would add to …`）が、そのインスタンスの環境変数どおり
     （例: `PI_CODING_AGENT_DIR=~/.pi/agent-zai` なら `~/.pi/agent-zai/skills`・`~/.pi/agent-zai/mcp.json`）。変数が無ければ既定の場所。
   - `config.json` で外したインスタンスが `excluded` になっている。
   - `no known skills folder` / `no known MCP config` と出た有効なインスタンスがあれば、そこには入らないことをユーザーに伝える。
   食い違いが1つでもあれば実行しない。ユーザーに報告し、`link.mjs` の `DRIVERS` か `DEFAULT_ON` を直してから 1 からやり直す。
4. **ユーザーに見せる。** インスタンスごとに「入れる場所 / 除外 / 飛ばす理由」を表にして見せ、了承をもらってから `--dry-run` なしで実行する。
   スキルが MCP サーバーの道具を使う（instant-ui など）のに `--mcp` を付けていないなら、そのサーバーも登録しないと動かない、と伝える。
5. **実行後。** 出力の `linked` / `added` を報告し、各ハーネスで新しいセッションを始めると読み込まれる、と伝える。
   失敗（終了コード 1）があれば、その行をそのまま伝える。

## MCP サーバーも登録する（オプション）
`--mcp=<サーバー名>` を付けたときだけ、Claude Code にユーザー単位で登録済みのサーバー（`~/.claude.json`）を、
各ハーネスの CLI で同じ名前のまま登録する。スキルフォルダは省略できる。
```
node ~/.claude/skills/t3-link-skill/link.mjs <スキルフォルダ> --mcp=instant-ui --dry-run
node ~/.claude/skills/t3-link-skill/link.mjs --mcp=instant-ui --dry-run
```
- 登録先: Claude Code `claude mcp add-json -s user`、Codex `codex mcp add`（`config.toml`）、
  Pi `pi mcp add`（各インスタンスの `PI_CODING_AGENT_DIR` の `mcp.json`）、Antigravity `agy mcp add`（`~/.gemini/config/mcp_config.json`）。
- 対象は stdio と http のサーバーだけ。Codex はヘッダー付きの http サーバーを CLI で受けられないので飛ばす。
- 同じ名前のサーバーがすでにあるハーネスは書き換えない。絞り込みと「除外したインスタンスと共有のファイルには書かない」はスキルと同じ。
- サーバーの環境変数（`env`）やヘッダーもそのまま写すので、秘密の値が入っていれば各ハーネスの設定ファイルにも入る。実行前に伝える。
- Codex の待ち時間（`tool_timeout_sec`）のような、ハーネス固有の設定は写らない。

## 対象の絞り込み: `config.json`
このフォルダの `config.json`（マシンごとの設定なので git には入れない。無ければ全インスタンスが対象）。
`config.example.json` を写して作る。
```json
{ "mode": "deny", "instances": ["pi"] }
```
- `mode`: `all`（全部）/ `allow`（`instances` だけ）/ `deny`（`instances` 以外）
- `instances`: T3 のプロバイダーインスタンス ID（`claudeAgent`、`codex`、`pi`、`antigravity`、自分で足した Pi インスタンスの ID など）。
  ID は T3 の `orchestrator_capabilities` の `providerInstanceId` か、settings.json の `providerInstances` のキー。

## 動き
- 有効なインスタンスだけが対象。無効なものは出てこない。
- スキルフォルダの場所: Claude Code `~/.claude/skills`（`CLAUDE_CONFIG_DIR`）、Codex `~/.codex/skills`（`CODEX_HOME`）、
  Pi `~/.pi/agent/skills`（`PI_CODING_AGENT_DIR`）、Antigravity `~/.gemini/config/skills`、OpenCode `~/.config/opencode/skills`、fx `~/.fx/skills`。
  括弧の変数は、T3 の設定でそのインスタンスに付けたものだけを見る。
- 外したインスタンスと同じフォルダを使うインスタンスには、リンクしない（外したはずのハーネスにも見えてしまうため）。
- スキルフォルダの場所がわからないハーネス（Cursor、Grok、Kiro、Muse など）は飛ばして、そう表示する。
- 同じ名前の別物がすでにあるときは上書きせずに飛ばし、終了コード 1 を返す。
- `~/.agents/skills` のように複数のハーネスが読む共有フォルダには書かない。Pi はどのインスタンスでも `~/.agents/skills` を読むので、
  そこに置いたスキルは除外したい Pi にも見えてしまう。

## 確認
`node ~/.claude/skills/t3-link-skill/test.mjs`（使い捨ての HOME で動かす）
