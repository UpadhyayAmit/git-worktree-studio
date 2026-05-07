import * as vscode from 'vscode';
import * as path from 'path';
import { GitWorktreeManager, RepoInfo, WorktreeInfo, FileChange } from './gitWorktreeManager';

// ---------------------------------------------------------------------------
// Shared item context values
// ---------------------------------------------------------------------------
type ItemContext = 'repo' | 'mainBranch' | 'branch' | 'file';

// ---------------------------------------------------------------------------
// Extended TreeItem
// ---------------------------------------------------------------------------
export class WorktreeTreeItem extends vscode.TreeItem {
    repoPath?: string;
    worktreePath?: string;
    branchName?: string;
    filePath?: string;
    fileStatus?: string;

    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        contextValue: ItemContext
    ) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
    }
}

// ---------------------------------------------------------------------------
// Repos Tree Provider (flat list of repos)
// ---------------------------------------------------------------------------
export class ReposTreeProvider implements vscode.TreeDataProvider<WorktreeTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<WorktreeTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private manager: GitWorktreeManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: WorktreeTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: WorktreeTreeItem): Promise<WorktreeTreeItem[]> {
        if (!element) {
            const repos = await this.manager.discoverRepos();
            return repos.map(repo => this.buildRepoItem(repo));
        }
        return [];
    }

    private buildRepoItem(repo: RepoInfo): WorktreeTreeItem {
        const item = new WorktreeTreeItem(
            repo.name,
            vscode.TreeItemCollapsibleState.None,
            'repo'
        );
        item.description = repo.currentBranch;
        item.tooltip = repo.repoPath;
        item.repoPath = repo.repoPath;
        item.iconPath = new vscode.ThemeIcon('repo');
        return item;
    }
}

// ---------------------------------------------------------------------------
// Changes Tree Provider (repo → branch → files)
// ---------------------------------------------------------------------------
export class ChangesTreeProvider implements vscode.TreeDataProvider<WorktreeTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<WorktreeTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private repos: RepoInfo[] = [];

    constructor(private manager: GitWorktreeManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async refreshData(): Promise<void> {
        this.repos = await this.manager.discoverRepos();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: WorktreeTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: WorktreeTreeItem): Promise<WorktreeTreeItem[]> {
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
            if (!repo) { return []; }
            return repo.worktrees.map(wt => this.buildBranchItem(wt, repo.repoPath));
        }

        if (
            (element.contextValue === 'branch' || element.contextValue === 'mainBranch') &&
            element.worktreePath &&
            element.repoPath
        ) {
            // Third level: changed files
            const repo = this.repos.find(r => r.repoPath === element.repoPath);
            if (!repo) { return []; }
            const wt = repo.worktrees.find(w => w.worktreePath === element.worktreePath);
            if (!wt) { return []; }
            return wt.changedFiles.map(f => this.buildFileItem(f));
        }

        return [];
    }

    private buildRepoItem(repo: RepoInfo): WorktreeTreeItem {
        const totalChanges = repo.worktrees.reduce(
            (sum, wt) => sum + wt.changedFiles.length, 0
        );
        const item = new WorktreeTreeItem(
            repo.name,
            vscode.TreeItemCollapsibleState.Expanded,
            'repo'
        );
        item.description = totalChanges > 0 ? `${totalChanges} changes` : '';
        item.tooltip = repo.repoPath;
        item.repoPath = repo.repoPath;
        item.iconPath = new vscode.ThemeIcon('repo');
        return item;
    }

    private buildBranchItem(wt: WorktreeInfo, repoPath: string): WorktreeTreeItem {
        const contextValue: ItemContext = wt.isMain ? 'mainBranch' : 'branch';
        const changeCount = wt.changedFiles.length;
        const label = wt.branch || path.basename(wt.worktreePath);

        const item = new WorktreeTreeItem(
            label,
            changeCount > 0
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.Collapsed,
            contextValue
        );

        const parts: string[] = [];
        if (wt.ahead > 0) { parts.push(`↑${wt.ahead}`); }
        if (wt.behind > 0) { parts.push(`↓${wt.behind}`); }
        if (changeCount > 0) { parts.push(`${changeCount} changes`); }
        item.description = parts.join('  ');

        item.tooltip = wt.worktreePath;
        item.repoPath = repoPath;
        item.worktreePath = wt.worktreePath;
        item.branchName = wt.branch;
        item.iconPath = new vscode.ThemeIcon(wt.isMain ? 'git-branch' : 'git-commit');
        return item;
    }

    private buildFileItem(change: FileChange): WorktreeTreeItem {
        const label = path.basename(change.filePath);
        const item = new WorktreeTreeItem(
            label,
            vscode.TreeItemCollapsibleState.None,
            'file'
        );

        item.description = this.statusLabel(change.status);
        item.tooltip = change.filePath;
        item.resourceUri = vscode.Uri.file(
            path.join(change.worktreePath, change.filePath)
        );
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

    private statusLabel(status: string): string {
        const map: Record<string, string> = {
            M: 'M', A: 'A', D: 'D', R: 'R', C: 'C', U: 'U', '??': 'U'
        };
        return map[status] ?? status;
    }

    private statusIcon(status: string): vscode.ThemeIcon {
        switch (status) {
            case 'M': return new vscode.ThemeIcon('git-commit');
            case 'A': return new vscode.ThemeIcon('diff-added');
            case 'D': return new vscode.ThemeIcon('diff-removed');
            case 'R': return new vscode.ThemeIcon('diff-renamed');
            case '??':
            case 'U': return new vscode.ThemeIcon('circle-outline');
            default:  return new vscode.ThemeIcon('file');
        }
    }
}
