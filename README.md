# Git Worktree Studio

**Author:** Amit Upadhyay  
**Package:** `git-worktree-studio`  
**Version:** 0.4.0

A VS Code extension for multi-repo, multi-branch parallel development using **git worktrees**, with a built-in **MCP server** for AI model integration (Claude, Copilot, GPT).

---

## Features

- **Multi-repo view** — auto-discovers all git repositories in the workspace (like VS Code Source Control)
- **Expandable repo tree** — Repositories panel now expands to show all worktrees with ahead/behind counts and change counts
- **Multiple branches per repo** — create, remove, and switch between worktree branches without stashing
- **Smart branch picker** — QuickPick lists all local and remote branches when switching, merging, rebasing, or creating PRs
- **Full source control** — commit, amend, push, pull, sync, fetch, stash, merge, rebase, diff, create PR
- **Stash management** — list, pop, or drop individual stashes from the context menu
- **Status bar** — shows the active worktree branch and ahead/behind counts for the current file
- **Configurable settings** — auto-refresh interval and repository discovery depth
- **Keyboard shortcuts** — quick access to Refresh, Fetch All, and Create Worktree
- **MCP server** — 27 tools for AI models to perform git operations in parallel across repos and branches

---

## Installation

### Prerequisites

- Node.js 18+
- VS Code 1.85+
- Git 2.30+
- (Optional) [GitHub CLI (`gh`)](https://cli.github.com/) for PR creation
- (Optional) [Azure CLI (`az`)](https://docs.microsoft.com/cli/azure/) for Azure DevOps PR creation

### Build from Source

```bash
npm install
npm run compile
npm run package
```

### Install Extension

```bash
code --install-extension git-worktree-studio-0.4.0.vsix --force
```

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `gitWorktreeStudio.autoRefreshInterval` | `30000` | Auto-refresh interval in ms (0 to disable) |
| `gitWorktreeStudio.discoveryDepth` | `2` | Max directory depth for repository discovery (1–5) |

---

## Keyboard Shortcuts

| Shortcut (Win/Linux) | Shortcut (macOS) | Command |
|---|---|---|
| `Ctrl+Shift+G R` | `Cmd+Shift+G R` | Refresh |
| `Ctrl+Shift+G F` | `Cmd+Shift+G F` | Fetch All |
| `Ctrl+Shift+G N` | `Cmd+Shift+G N` | Create Worktree Branch |

---

## MCP Server Configuration

Add to your VS Code `mcp.json` (e.g. `%APPDATA%\Code\User\mcp.json` on Windows):

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

### Verify MCP Server

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | node out/mcp/server.js
```

---

## Architecture

```
VS Code Extension (UI)          MCP Server (AI Interface)
  - Tree Views                    - 28 Tools
  - SCM Commands                  - stdio JSON-RPC
  - Status Bar                    - Protocol v2024-11-05
  - File Watcher                  
        |                               |
        +----------+--------------------+
                   |
        GitWorktreeManager
          - Repo discovery (configurable depth)
          - Worktree CRUD
          - Git operations
                   |
        File System (Local)
          workspace/
          ├── frontend/           (main)
          ├── frontend-wt-feat-a  (worktree)
          ├── backend/            (main)
          └── backend-wt-fix-x    (worktree)
```

---

## MCP Tools Reference

| Tool | Description |
|------|-------------|
| `list_repos` | Discover all git repos in a workspace |
| `create_branch` | Create a new worktree branch |
| `remove_branch` | Remove a worktree |
| `get_branch_info` | Get branch, ahead/behind, remote URL |
| `list_changes` | List modified/untracked files |
| `read_file` | Read file contents |
| `write_file` | Write/create a file |
| `diff` | Get git diff |
| `stage_files` | Stage files |
| `unstage_files` | Unstage files |
| `commit` | Commit changes |
| `amend_commit` | Amend the last commit |
| `push` | Push to remote |
| `pull` | Pull from remote (with rebase) |
| `fetch` | Fetch from all remotes (with prune) |
| `create_pull_request` | Create PR via gh/az CLI or browser |
| `stash` | Stash changes |
| `stash_pop` | Pop stash |
| `stash_drop` | Drop a specific stash by index |
| `list_stashes` | List all stashes |
| `log` | View recent commits |
| `merge` | Merge a branch |
| `rebase` | Rebase onto another branch |
| `switch_branch` | Checkout a branch in a worktree |
| `rename_branch` | Rename a local branch |
| `list_branches` | List all local and remote branches |
| `discard_changes` | Discard file changes |

---

## License

MIT
