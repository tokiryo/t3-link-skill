# t3-link-skill

[T3 Code](https://github.com/pingdotgg/t3code) に登録されているすべてのエージェントハーネス（Claude Code、Codex、各 Pi インスタンス、Antigravity、OpenCode、fx）で、1つのスキル（および任意で1つの MCP サーバー）を使えるようにします。
allow リストや deny リストで、指定したインスタンスを対象から外すこともできます。

T3 Code の設定からプロバイダーインスタンスを読み取り、それぞれのユーザースキル用フォルダ（`PI_CODING_AGENT_DIR` など、T3 がインスタンスごとに設定する変数を反映）を特定して、そこへスキルフォルダのシンボリックリンクを作成します。
`--mcp` を付けると、Claude Code に登録済みのサーバーを、他のハーネスそれぞれの CLI を使ってコピーします。

単一ファイル、Node 18+、依存パッケージなし。

## インストール
Claude Code のスキルとして導入する場合:
```sh
git clone https://github.com/tokiryo/t3-link-skill ~/.claude/skills/t3-link-skill
```
`SKILL.md` には、リンクを作成する前に実行計画と T3 Code 側の認識を突き合わせるようエージェントへの指示が書かれています。

## 使い方
```sh
node link.mjs <skill-folder> --dry-run             # スキルの配置先を確認する
node link.mjs <skill-folder>                       # リンクを作成する
node link.mjs <skill-folder> --mcp=<server> --dry-run   # Claude Code の MCP サーバーもあわせてコピーする
node link.mjs --mcp=<server>                       # MCP サーバーのみコピーする
```

## インスタンスの選択
`config.example.json` を `config.json`（git 管理外）にコピーします。このファイルがない場合は、有効になっているすべてのインスタンスが対象になります。
```json
{ "mode": "deny", "instances": ["pi"] }
```
- `mode`: `all`、`allow`（`instances` のみ）、または `deny`（`instances` 以外すべて）。
- `instances`: `claudeAgent`、`codex`、`pi`、`antigravity` などの T3 プロバイダーインスタンス ID、または自分で追加したインスタンスの ID（`~/.t3/userdata/settings.json` 内の `providerInstances` のキー）。

## 書き込み先
| Driver | Skills | MCP (`--mcp` 指定時) |
|---|---|---|
| Claude Code | `~/.claude/skills` (`CLAUDE_CONFIG_DIR`) | `claude mcp add-json -s user` |
| Codex | `~/.codex/skills` (`CODEX_HOME`) | `codex mcp add` |
| Pi | `~/.pi/agent/skills` (`PI_CODING_AGENT_DIR`) | `pi mcp add` → 同じフォルダ内の `mcp.json` |
| Antigravity | `~/.gemini/config/skills` | `agy mcp add` → `~/.gemini/config/mcp_config.json` |
| OpenCode | `~/.config/opencode/skills` | - |
| fx | `~/.fx/skills` | - |

括弧内の環境変数は、T3 がそのインスタンスに対して設定している場合にのみ参照され、スクリプトを実行しているシェルにたまたま設定されていても無視されます。

## ルール
- 有効なインスタンスのみが対象です。対応フォルダが不明なドライバー（Cursor、Grok、Kiro、Muse）のインスタンスは一覧に表示されたうえでスキップされます。
- 除外されたインスタンスも共有して使っているフォルダや設定ファイルには手を加えないため、除外設定が確実に守られます。
- 上書きは行いません。同名の項目がすでにある場合はその旨を報告してスキップします（終了コード 1）。
- `~/.agents/skills` のような共有フォルダには一切書き込みません。複数のハーネス（Pi を含む）がそこを読み込むため、そこに置くと除外したインスタンスにまでスキルが届いてしまうからです。
- `--mcp` がコピーするのは stdio と http のサーバーのみで、`env` やヘッダー（シークレットを含む）もそのまま引き継がれます。Codex の `tool_timeout_sec` のようなハーネス固有の設定はコピーされません。

## 制限事項
- フォルダの場所は T3 Code 側が一覧を持っていないため、各ハーネスの規約とコードから割り出しています。Antigravity のパスと、Pi が `~/.agents/skills` を読み込む仕様についてはコードから確認したもので、実際にスキルを読み込ませての検証は行っていません。
- 対象はこのマシン上のインスタンスのみです。T3 Code にリンクされている他の環境には一切触れません。

## テスト
```sh
node test.mjs
```
使い捨ての `HOME` 環境で、各ハーネス CLI のスタブを使って実行されます。
