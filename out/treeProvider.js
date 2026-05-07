"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChangesTreeProvider = exports.ReposTreeProvider = exports.WorktreeTreeItem = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
// ---------------------------------------------------------------------------
// Extended TreeItem
// ---------------------------------------------------------------------------
class WorktreeTreeItem extends vscode.TreeItem {
    constructor(label, collapsibleState, contextValue) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
    }
}
exports.WorktreeTreeItem = WorktreeTreeItem;
// ---------------------------------------------------------------------------
// Repos Tree Provider (flat list of repos)
// ---------------------------------------------------------------------------
class ReposTreeProvider {
    constructor(manager) {
        this.manager = manager;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!element) {
            const repos = await this.manager.discoverRepos();
            return repos.map(repo => this.buildRepoItem(repo));
        }
        return [];
    }
    buildRepoItem(repo) {
        const item = new WorktreeTreeItem(repo.name, vscode.TreeItemCollapsibleState.None, 'repo');
        item.description = repo.currentBranch;
        item.tooltip = repo.repoPath;
        item.repoPath = repo.repoPath;
        item.iconPath = new vscode.ThemeIcon('repo');
        return item;
    }
}
exports.ReposTreeProvider = ReposTreeProvider;
// ---------------------------------------------------------------------------
// Changes Tree Provider (repo → branch → files)
// ---------------------------------------------------------------------------
class ChangesTreeProvider {
    constructor(manager) {
        this.manager = manager;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.repos = [];
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    async refreshData() {
        this.repos = await this.manager.discoverRepos();
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!element) {
            // Top level: repos
            if (this.repos.length === 0) {
                this.repos = await this.manager.discoverRepos();
            }
            return this.repos.map(repo => this.buildRepoItem(repo));
        }
        if (element.contextValue === 'repo' && element.repoPath) {
            // Second level: branches (worktrees)
            const repo = this.repos.find(r => r.repoPath === element.repoPath);
            if (!repo) {
                return [];
            }
            return repo.worktrees.map(wt => this.buildBranchItem(wt, repo.repoPath));
        }
        if ((element.contextValue === 'branch' || element.contextValue === 'mainBranch') &&
            element.worktreePath &&
            element.repoPath) {
            // Third level: changed files
            const repo = this.repos.find(r => r.repoPath === element.repoPath);
            if (!repo) {
                return [];
            }
            const wt = repo.worktrees.find(w => w.worktreePath === element.worktreePath);
            if (!wt) {
                return [];
            }
            return wt.changedFiles.map(f => this.buildFileItem(f));
        }
        return [];
    }
    buildRepoItem(repo) {
        const totalChanges = repo.worktrees.reduce((sum, wt) => sum + wt.changedFiles.length, 0);
        const item = new WorktreeTreeItem(repo.name, vscode.TreeItemCollapsibleState.Expanded, 'repo');
        item.description = totalChanges > 0 ? `${totalChanges} changes` : '';
        item.tooltip = repo.repoPath;
        item.repoPath = repo.repoPath;
        item.iconPath = new vscode.ThemeIcon('repo');
        return item;
    }
    buildBranchItem(wt, repoPath) {
        const contextValue = wt.isMain ? 'mainBranch' : 'branch';
        const changeCount = wt.changedFiles.length;
        const label = wt.branch || path.basename(wt.worktreePath);
        const item = new WorktreeTreeItem(label, changeCount > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed, contextValue);
        const parts = [];
        if (wt.ahead > 0) {
            parts.push(`↑${wt.ahead}`);
        }
        if (wt.behind > 0) {
            parts.push(`↓${wt.behind}`);
        }
        if (changeCount > 0) {
            parts.push(`${changeCount} changes`);
        }
        item.description = parts.join('  ');
        item.tooltip = wt.worktreePath;
        item.repoPath = repoPath;
        item.worktreePath = wt.worktreePath;
        item.branchName = wt.branch;
        item.iconPath = new vscode.ThemeIcon(wt.isMain ? 'git-branch' : 'git-commit');
        return item;
    }
    buildFileItem(change) {
        const label = path.basename(change.filePath);
        const item = new WorktreeTreeItem(label, vscode.TreeItemCollapsibleState.None, 'file');
        item.description = this.statusLabel(change.status);
        item.tooltip = change.filePath;
        item.resourceUri = vscode.Uri.file(path.join(change.worktreePath, change.filePath));
        item.repoPath = change.repoPath;
        item.worktreePath = change.worktreePath;
        item.filePath = change.filePath;
        item.fileStatus = change.status;
        item.command = {
            command: 'gitMultiBranch.openFile',
            title: 'Open File',
            arguments: [item]
        };
        item.iconPath = this.statusIcon(change.status);
        return item;
    }
    statusLabel(status) {
        const map = {
            M: 'M', A: 'A', D: 'D', R: 'R', C: 'C', U: 'U', '??': 'U'
        };
        return map[status] ?? status;
    }
    statusIcon(status) {
        switch (status) {
            case 'M': return new vscode.ThemeIcon('git-commit');
            case 'A': return new vscode.ThemeIcon('diff-added');
            case 'D': return new vscode.ThemeIcon('diff-removed');
            case 'R': return new vscode.ThemeIcon('diff-renamed');
            case '??':
            case 'U': return new vscode.ThemeIcon('circle-outline');
            default: return new vscode.ThemeIcon('file');
        }
    }
}
exports.ChangesTreeProvider = ChangesTreeProvider;
//# sourceMappingURL=treeProvider.js.map