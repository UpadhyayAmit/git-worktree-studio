# Git Worktree Studio

**Author:** Amit Upadhyay  
**Package:** `git-worktree-studio`  
**Version:** 0.3.0

A VS Code extension for multi-repo, multi-branch parallel development using **git worktrees**, with a built-in **MCP server** for AI model integration (Claude, Copilot, GPT).

---

## Features

- **Multi-repo view** — auto-discovers all git repositories in the workspace (like VS Code Source Control)
- **Multiple branches per repo** — create, remove, and switch between worktree branches without stashing
- **Full source control** — commit, push, pull, sync, stash, merge, diff, create PR
- **MCP server** — 19 tools for AI models to perform git operations in parallel across repos and branches

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
code --install-extension git-worktree-studio-0.3.0.vsix --force
```

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
  - Tree Views                    - 19 Tools
  - SCM Commands                  - stdio JSON-RPC
  - File Watcher                  - Protocol v2024-11-05
        |                               |
        +----------+--------------------+
                   |
        GitWorktreeManager
          - Repo discovery (depth 2)
          - Worktree CRUD
          - Git operations
                   |
        File System (Local)
          workspace/
          ├── frontend/           (main)
          ├── frontend-wt-feat-a  (worktree)
          ├── shipment/           (main)
          └── shipment-wt-fix-x   (worktree)
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
| `push` | Push to remote |
| `pull` | Pull from remote (with rebase) |
| `create_pull_request` | Create PR via gh/az CLI or browser |
| `stash` | Stash changes |
| `stash_pop` | Pop stash |
| `log` | View recent commits |
| `merge` | Merge a branch |
| `discard_changes` | Discard file changes |

---

## License

MIT