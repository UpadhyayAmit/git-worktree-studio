# Git Worktree Studio

<div align="center">

![Version](https://img.shields.io/badge/version-0.4.0-blue)
![VS Code](https://img.shields.io/badge/vscode-%5E1.85.0-007ACC?logo=visualstudiocode)
![License](https://img.shields.io/badge/license-MIT-green)
![MCP](https://img.shields.io/badge/MCP-27%20tools-purple)

**Multi-repo, multi-branch parallel development using git worktrees — with a built-in MCP server for AI model integration (Claude, Copilot, GPT).**

</div>

---

## What Problem Does This Solve?

Without worktrees, switching branches means stashing, waiting, context-switching. With **Git Worktree Studio**, each branch lives in its own folder — you develop `feat-auth`, `fix-bug`, and `main` simultaneously, side-by-side in VS Code.

```text
❌  Without Worktrees             ✅  With Git Worktree Studio
──────────────────────────        ────────────────────────────────────
 [Work on main]                   main/              ← always open
       │ stash ↓                  repo-wt-feat-auth/ ← open in parallel
 [Switch to feat-auth]            repo-wt-fix-bug/   ← open in parallel
       │ stash ↓
 [Switch to fix-bug]              No stashing.  No context-switching.
       │ restore ↓                All branches open simultaneously.
 [Back to main — lost focus]
```

---

## Architecture

```text
┌──────────────────────────────────────────┐
│           VS Code Extension              │
│                                          │
│  🌲 Tree Views      📊 Status Bar        │
│  Repos · Changes    Branch · ↑↓ counts  │
│                                          │
│  ⚡ 30+ Commands    👁 File Watcher      │
│  SCM actions        auto-refresh         │
└──────────────────────┬───────────────────┘
                       │ commands / events
           ┌───────────▼────────────┐
           │   GitWorktreeManager   │
           │  Repo discovery        │
           │  Worktree CRUD         │
           │  Git shell operations  │
           └──────┬─────────┬───────┘
        tool calls │         │ git operations
   ┌───────────────▼──┐  ┌──▼───────────────────┐
   │   MCP Server     │  │  Local File System    │
   │  27 tools        │  │  frontend/    ← main  │
   │  stdio JSON-RPC  │  │  frontend-wt/ ← wt    │
   │  AI: Claude/GPT  │  │  backend/     ← main  │
   └──────────────────┘  │  backend-wt/  ← wt    │
                         └───────────────────────┘
```

---

## Parallel Development Workflow

```text
  Step 1 ─ Create Worktree Branch
  ┌──────────────────────────────────────────────────────┐
  │  You:  Create Worktree Branch "feat-auth"            │
  │  GWS:  git worktree add ../repo-wt-feat-auth         │
  │  ✅    New folder created — open in new window?      │
  └──────────────────────────────────────────────────────┘

  Step 2 ─ Develop in Parallel
  ┌──────────────────────────────────────────────────────┐
  │  main/              ← untouched, open in VS Code     │
  │  repo-wt-feat-auth/ ← active development             │
  └──────────────────────────────────────────────────────┘

  Step 3 ─ Commit & Push
  ┌──────────────────────────────────────────────────────┐
  │  git commit -m "feat: add authentication"            │
  │  git push origin feat-auth                           │
  └──────────────────────────────────────────────────────┘

  Step 4 ─ Create Pull Request
  ┌──────────────────────────────────────────────────────┐
  │  GitHub:       gh pr create                          │
  │  Azure DevOps: az repos pr create                    │
  │  ✅  PR URL opens in browser                         │
  └──────────────────────────────────────────────────────┘

  ✨  main branch remained untouched throughout!
```

---

## Features

### Core Capabilities

**Repositories**

- Auto-discover all repos in multi-root workspace
- Expandable tree with ahead/behind counts
- Multi-root workspace support

**Branches & Worktrees**

- Create worktree branches — develop in parallel folders
- Switch branches without stashing
- Rename · Delete · List local + remote branches

**Source Control**

- Commit · Amend · Push · Pull · Sync
- Fetch all remotes
- Merge · Rebase
- Create PR via `gh` (GitHub) or `az` (Azure DevOps)

**Stash**

- List all stashes
- Pop · Drop individual stash

**MCP Server — AI Integration**

- 27 tools for AI models (Claude, Copilot, GPT)
- stdio JSON-RPC protocol
- Full git operations via tool calls

**UI**

- Status bar branch indicator
- Keyboard shortcuts
- Configurable auto-refresh

---

## MCP Server — AI Integration

Connect AI models (Claude, Copilot, GPT) to your git repos and let them operate across branches in parallel.

```text
  ┌───────────────┐   tool calls    ┌──────────────────┐   ┌───────────────────────┐
  │  AI Models    │   via stdio     │  Git Operations  │   │    Repositories       │
  │               │                 │                  │   │                       │
  │  🤖 Claude   ├────────────────►│  git CLI         ├──►│  💾 Local Worktrees   │
  │  🤖 Copilot  │  MCP Server     │  gh CLI (PRs)    │   │  ☁️  Remote Branches  │
  │  🤖 GPT      │  JSON-RPC       │  az CLI (PRs)    │   │                       │
  └───────────────┘                 └──────────────────┘   └───────────────────────┘
```

### MCP Tools Reference

| Category             | Tools                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Repos & Branches** | `list_repos`, `create_branch`, `remove_branch`, `get_branch_info`, `list_branches`, `switch_branch`, `rename_branch` |
| **File Operations**  | `list_changes`, `read_file`, `write_file`, `diff`, `stage_files`, `unstage_files`, `discard_changes`                 |
| **Commits**          | `commit`, `amend_commit`, `log`                                                                                      |
| **Remote Sync**      | `push`, `pull`, `fetch`, `create_pull_request`                                                                       |
| **Stash**            | `stash`, `stash_pop`, `stash_drop`, `list_stashes`                                                                   |
| **History**          | `merge`, `rebase`                                                                                                    |

---

## Installation

### Prerequisites

| Requirement     | Version | Notes                           |
| --------------- | ------- | ------------------------------- |
| Node.js         | 18+     | Required                        |
| VS Code         | 1.85+   | Required                        |
| Git             | 2.30+   | Required                        |
| GitHub CLI `gh` | any     | Optional — for GitHub PRs       |
| Azure CLI `az`  | any     | Optional — for Azure DevOps PRs |

### Install from VSIX (build from source)

```bash
# 1. Clone & install dependencies
git clone https://github.com/UpadhyayAmit/git-worktree-studio
cd git-worktree-studio
npm install

# 2. Compile & package
npm run compile
npm run package       # produces git-worktree-studio-0.4.0.vsix

# 3. Install in VS Code
code --install-extension git-worktree-studio-0.4.0.vsix --force
```

### Install from Marketplace

Search for **"Git Worktree Studio"** in the VS Code Extensions panel, or visit the [Marketplace page](https://marketplace.visualstudio.com/items?itemName=AmitUpadhyay.git-worktree-studio).

---

## Configuration

| Setting                                 | Default | Description                        |
| --------------------------------------- | ------- | ---------------------------------- |
| `gitWorktreeStudio.autoRefreshInterval` | `30000` | Auto-refresh in ms (0 = disabled)  |
| `gitWorktreeStudio.discoveryDepth`      | `2`     | Max depth for repo discovery (1–5) |

---

## Keyboard Shortcuts

| Win / Linux      | macOS           | Command                |
| ---------------- | --------------- | ---------------------- |
| `Ctrl+Shift+G R` | `Cmd+Shift+G R` | Refresh                |
| `Ctrl+Shift+G F` | `Cmd+Shift+G F` | Fetch All              |
| `Ctrl+Shift+G N` | `Cmd+Shift+G N` | Create Worktree Branch |

---

## MCP Server Setup

Add to your VS Code `mcp.json` (`%APPDATA%\Code\User\mcp.json` on Windows):

```json
{
  "servers": {
    "git-worktree-studio": {
      "type": "stdio",
      "command": "node",
      "args": ["<path-to-extension>/out/mcp/server.js"]
    }
  }
}
```

**Verify the server starts correctly:**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | node out/mcp/server.js
```

---

## License

MIT — © Amit Upadhyay
