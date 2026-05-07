import * as vscode from 'vscode';
import * as path from 'path';
import { GitWorktreeManager } from './gitWorktreeManager';
import { ReposTreeProvider, ChangesTreeProvider, WorktreeTreeItem } from './treeProvider';

export function activate(context: vscode.ExtensionContext): void {
    const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath);
    const manager = new GitWorktreeManager(workspaceFolders);

    const reposProvider = new ReposTreeProvider(manager);
    const changesProvider = new ChangesTreeProvider(manager);

    // Register tree views
    const reposView = vscode.window.createTreeView('gitWorktreeRepos', {
        treeDataProvider: reposProvider,
        showCollapseAll: true
    });
    const changesView = vscode.window.createTreeView('gitWorktreeChanges', {
        treeDataProvider: changesProvider,
        showCollapseAll: true
    });

    context.subscriptions.push(reposView, changesView);

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function refreshAll(): void {
        reposProvider.refresh();
        changesProvider.refreshData();
    }

    async function requireInput(prompt: string, placeholder = ''): Promise<string | undefined> {
        return vscode.window.showInputBox({ prompt, placeHolder: placeholder, ignoreFocusOut: true });
    }

    // -------------------------------------------------------------------------
    // Worktree Management Commands
    // -------------------------------------------------------------------------

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.createWorktree', async () => {
            const repos = await manager.discoverRepos();
            if (repos.length === 0) {
                vscode.window.showWarningMessage('No git repositories found in workspace.');
                return;
            }

            const repoItems = repos.map(r => ({ label: r.name, description: r.repoPath }));
            const picked = await vscode.window.showQuickPick(repoItems, {
                placeHolder: 'Select repository'
            });
            if (!picked?.description) { return; }

            const branchName = await requireInput('Enter branch name', 'feature/my-feature');
            if (!branchName) { return; }

            try {
                const worktreePath = await manager.createWorktree(picked.description, branchName);
                vscode.window.showInformationMessage(`Worktree created at: ${worktreePath}`);
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to create worktree: ${err}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.addBranch', async (item: WorktreeTreeItem) => {
            if (!item?.repoPath) { return; }
            const branchName = await requireInput('Enter branch name', 'feature/my-feature');
            if (!branchName) { return; }

            try {
                const worktreePath = await manager.createWorktree(item.repoPath, branchName);
                vscode.window.showInformationMessage(`Worktree created at: ${worktreePath}`);
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to create branch: ${err}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.removeWorktree', async (item: WorktreeTreeItem) => {
            if (!item?.repoPath || !item.worktreePath) { return; }
            const confirm = await vscode.window.showWarningMessage(
                `Remove worktree for branch "${item.branchName}"? This will delete the directory.`,
                { modal: true },
                'Remove'
            );
            if (confirm !== 'Remove') { return; }

            try {
                await manager.removeWorktree(item.repoPath, item.worktreePath);
                vscode.window.showInformationMessage('Worktree removed.');
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to remove worktree: ${err}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.openWorktree', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath) { return; }
            const uri = vscode.Uri.file(item.worktreePath);
            await vscode.commands.executeCommand('vscode.openFolder', uri, true);
        })
    );

    // -------------------------------------------------------------------------
    // Source Control — Branch-Level Commands
    // -------------------------------------------------------------------------

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.commitWorktree', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath) { return; }
            const message = await requireInput('Commit message');
            if (!message) { return; }

            try {
                await manager.commit(item.worktreePath, message, true);
                vscode.window.showInformationMessage('Committed successfully.');
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Commit failed: ${err}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.push', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath) { return; }
            try {
                await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: 'Pushing…' },
                    async () => {
                        try {
                            await manager.push(item.worktreePath!);
                        } catch {
                            await manager.push(item.worktreePath!, true);
                        }
                    }
                );
                vscode.window.showInformationMessage('Push successful.');
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Push failed: ${err}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.pull', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath) { return; }
            try {
                await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: 'Pulling…' },
                    () => manager.pull(item.worktreePath!)
                );
                vscode.window.showInformationMessage('Pull successful.');
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Pull failed: ${err}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.syncBranch', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath) { return; }
            try {
                await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: 'Syncing…' },
                    () => manager.sync(item.worktreePath!)
                );
                vscode.window.showInformationMessage('Sync successful.');
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Sync failed: ${err}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.createPR', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath) { return; }

            const title = await requireInput('PR title');
            if (!title) { return; }
            const baseBranch = await requireInput('Base branch', 'main') ?? 'main';

            try {
                const result = await manager.createPR(item.worktreePath, title, baseBranch);
                const openBrowser = await vscode.window.showInformationMessage(
                    `PR created: ${result}`,
                    'Open in Browser'
                );
                if (openBrowser && result.startsWith('http')) {
                    vscode.env.openExternal(vscode.Uri.parse(result));
                }
            } catch (err) {
                vscode.window.showErrorMessage(`Create PR failed: ${err}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.stash', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath) { return; }
            const message = await requireInput('Stash message (optional)');
            try {
                await manager.stash(item.worktreePath, message || undefined);
                vscode.window.showInformationMessage('Changes stashed.');
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Stash failed: ${err}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.stashPop', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath) { return; }
            try {
                await manager.stashPop(item.worktreePath);
                vscode.window.showInformationMessage('Stash popped.');
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Stash pop failed: ${err}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.mergeBranch', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath) { return; }
            const sourceBranch = await requireInput('Branch to merge into current');
            if (!sourceBranch) { return; }

            try {
                await manager.mergeBranch(item.worktreePath, sourceBranch);
                vscode.window.showInformationMessage(`Merged "${sourceBranch}" successfully.`);
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Merge failed: ${err}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.viewLog', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath) { return; }
            try {
                const log = await manager.getLog(item.worktreePath);
                const doc = await vscode.workspace.openTextDocument({
                    content: log,
                    language: 'plaintext'
                });
                await vscode.window.showTextDocument(doc);
            } catch (err) {
                vscode.window.showErrorMessage(`View log failed: ${err}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.switchBranch', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath) { return; }
            const branchName = await requireInput('Branch name to checkout');
            if (!branchName) { return; }

            try {
                await manager.switchBranch(item.worktreePath, branchName);
                vscode.window.showInformationMessage(`Switched to "${branchName}".`);
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Switch branch failed: ${err}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.deleteBranch', async (item: WorktreeTreeItem) => {
            if (!item?.repoPath || !item.branchName) { return; }
            const confirm = await vscode.window.showWarningMessage(
                `Delete branch "${item.branchName}"?`,
                { modal: true },
                'Delete'
            );
            if (confirm !== 'Delete') { return; }

            try {
                await manager.deleteBranch(item.repoPath, item.branchName);
                vscode.window.showInformationMessage(`Branch "${item.branchName}" deleted.`);
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Delete branch failed: ${err}`);
            }
        })
    );

    // -------------------------------------------------------------------------
    // Source Control — File-Level Commands
    // -------------------------------------------------------------------------

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.stageFile', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath || !item.filePath) { return; }
            try {
                await manager.stageFile(item.worktreePath, item.filePath);
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Stage failed: ${err}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.unstageFile', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath || !item.filePath) { return; }
            try {
                await manager.unstageFile(item.worktreePath, item.filePath);
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Unstage failed: ${err}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.discardFile', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath || !item.filePath) { return; }
            const confirm = await vscode.window.showWarningMessage(
                `Discard changes to "${item.filePath}"?`,
                { modal: true },
                'Discard'
            );
            if (confirm !== 'Discard') { return; }

            try {
                await manager.discardFile(item.worktreePath, item.filePath);
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Discard failed: ${err}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.diffFile', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath || !item.filePath) { return; }
            const absolutePath = path.join(item.worktreePath, item.filePath);
            const uri = vscode.Uri.file(absolutePath);
            await vscode.commands.executeCommand('git.openChange', uri);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.openFile', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath || !item.filePath) { return; }
            const absolutePath = path.join(item.worktreePath, item.filePath);
            const uri = vscode.Uri.file(absolutePath);
            await vscode.window.showTextDocument(uri);
        })
    );

    // -------------------------------------------------------------------------
    // Global Commands
    // -------------------------------------------------------------------------

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.refresh', () => refreshAll())
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.fetchAll', async () => {
            const repos = await manager.discoverRepos();
            try {
                await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: 'Fetching all remotes…' },
                    async () => {
                        for (const repo of repos) {
                            await manager.fetchAll(repo.repoPath);
                        }
                    }
                );
                vscode.window.showInformationMessage('Fetch all completed.');
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Fetch all failed: ${err}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.startMcpServer', () => {
            const extensionPath = context.extensionPath;
            const serverPath = path.join(extensionPath, 'out', 'mcp', 'server.js');
            const terminal = vscode.window.createTerminal('Git Worktree MCP Server');
            terminal.sendText(`node "${serverPath}"`);
            terminal.show();
        })
    );

    // -------------------------------------------------------------------------
    // Auto-refresh: every 30s + file watcher with 2s debounce
    // -------------------------------------------------------------------------

    const refreshInterval = setInterval(() => refreshAll(), 30_000);
    context.subscriptions.push({ dispose: () => clearInterval(refreshInterval) });

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const watcher = vscode.workspace.createFileSystemWatcher('**/.git/{HEAD,index,FETCH_HEAD}');
    const onFsChange = (): void => {
        if (debounceTimer) { clearTimeout(debounceTimer); }
        debounceTimer = setTimeout(() => refreshAll(), 2_000);
    };
    watcher.onDidChange(onFsChange);
    watcher.onDidCreate(onFsChange);
    watcher.onDidDelete(onFsChange);
    context.subscriptions.push(watcher);

    // Update manager when workspace folders change
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(e => {
            const folders = (e.added.concat(
                vscode.workspace.workspaceFolders?.filter(
                    f => !e.removed.some(r => r.uri.fsPath === f.uri.fsPath)
                ) ?? []
            )).map(f => f.uri.fsPath);
            manager.updateWorkspaceFolders(folders);
            refreshAll();
        })
    );

    // Initial load
    changesProvider.refreshData();
}

export function deactivate(): void {
    // nothing to clean up beyond subscriptions
}
