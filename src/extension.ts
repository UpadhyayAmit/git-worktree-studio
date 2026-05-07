import * as vscode from 'vscode';
import * as path from 'path';
import { GitWorktreeManager } from './gitWorktreeManager';
import { ReposTreeProvider, ChangesTreeProvider, WorktreeTreeItem } from './treeProvider';

export function activate(context: vscode.ExtensionContext): void {
    const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).map((f: vscode.WorkspaceFolder) => f.uri.fsPath);

    // Read configuration
    function getConfig(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration('gitWorktreeStudio');
    }

    const manager = new GitWorktreeManager(
        workspaceFolders,
        getConfig().get<number>('discoveryDepth', 2)
    );

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
    // Status bar
    // -------------------------------------------------------------------------

    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'gitMultiBranch.refresh';
    statusBarItem.tooltip = 'Git Worktree Studio — click to refresh';
    context.subscriptions.push(statusBarItem);

    async function updateStatusBar(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            statusBarItem.hide();
            return;
        }
        const filePath = editor.document.uri.fsPath;
        const repos = await manager.discoverRepos();
        for (const repo of repos) {
            for (const wt of repo.worktrees) {
                if (filePath.startsWith(wt.worktreePath)) {
                    const aheadBehind = [];
                    if (wt.ahead > 0) { aheadBehind.push(`↑${wt.ahead}`); }
                    if (wt.behind > 0) { aheadBehind.push(`↓${wt.behind}`); }
                    const suffix = aheadBehind.length > 0 ? ` ${aheadBehind.join(' ')}` : '';
                    statusBarItem.text = `$(git-branch) ${wt.branch}${suffix}`;
                    statusBarItem.show();
                    return;
                }
            }
        }
        statusBarItem.hide();
    }

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => { updateStatusBar(); })
    );

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function refreshAll(): void {
        reposProvider.refresh();
        changesProvider.refreshData();
        updateStatusBar();
    }

    async function requireInput(prompt: string, placeholder = ''): Promise<string | undefined> {
        return vscode.window.showInputBox({ prompt, placeHolder: placeholder, ignoreFocusOut: true });
    }

    async function pickBranch(repoPath: string, prompt: string): Promise<string | undefined> {
        try {
            const { local, remote } = await manager.listAllBranches(repoPath);
            const items = [
                ...local.map(b => ({ label: b, description: 'local' })),
                ...remote.map(b => ({ label: b, description: 'remote' }))
            ];
            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: prompt,
                matchOnDescription: true
            });
            return picked?.label;
        } catch {
            return requireInput(prompt);
        }
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

            const branchName = await requireInput('Enter new branch name', 'feature/my-feature');
            if (!branchName) { return; }

            const baseBranch = await pickBranch(picked.description, 'Select base branch (or type a branch name)');

            const customPath = await requireInput(
                'Worktree path (leave empty for default)',
                path.join(path.dirname(picked.description), `${path.basename(picked.description)}-wt-${branchName.replace(/[/\\]/g, '-')}`)
            );

            try {
                const worktreePath = baseBranch
                    ? await manager.createWorktreeFromBase(picked.description, branchName, baseBranch, customPath || undefined)
                    : await manager.createWorktree(picked.description, branchName, customPath || undefined);
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
            const branchName = await requireInput('Enter new branch name', 'feature/my-feature');
            if (!branchName) { return; }

            const baseBranch = await pickBranch(item.repoPath, 'Select base branch (or type a branch name)');

            try {
                const worktreePath = baseBranch
                    ? await manager.createWorktreeFromBase(item.repoPath, branchName, baseBranch)
                    : await manager.createWorktree(item.repoPath, branchName);
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
        vscode.commands.registerCommand('gitMultiBranch.amendCommit', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath) { return; }
            const choice = await vscode.window.showQuickPick(
                [
                    { label: 'Keep existing message', value: 'keep' },
                    { label: 'Edit message', value: 'edit' }
                ],
                { placeHolder: 'Amend last commit' }
            );
            if (!choice) { return; }

            let message: string | undefined;
            if (choice.value === 'edit') {
                message = await requireInput('New commit message');
                if (!message) { return; }
            }

            try {
                await manager.amendCommit(item.worktreePath, message);
                vscode.window.showInformationMessage('Commit amended successfully.');
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Amend failed: ${err}`);
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

            const baseBranch = item.repoPath
                ? await pickBranch(item.repoPath, 'Select base branch')
                : await requireInput('Base branch', 'main') ?? 'main';
            if (!baseBranch) { return; }

            const body = await requireInput('PR description (optional)') ?? '';

            try {
                const result = await manager.createPR(item.worktreePath, title, baseBranch, body);
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
        vscode.commands.registerCommand('gitMultiBranch.stashList', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath) { return; }
            try {
                const stashes = await manager.listStashes(item.worktreePath);
                if (stashes.length === 0) {
                    vscode.window.showInformationMessage('No stashes found.');
                    return;
                }
                const picked = await vscode.window.showQuickPick(
                    stashes.map((s, i) => ({ label: s, index: i })),
                    { placeHolder: 'Select a stash to pop (or press Escape to cancel)' }
                );
                if (!picked) { return; }
                const action = await vscode.window.showQuickPick(
                    ['Pop', 'Drop'],
                    { placeHolder: `Action for "${picked.label}"` }
                );
                if (action === 'Pop') {
                    await manager.stashPop(item.worktreePath);
                    vscode.window.showInformationMessage('Stash popped.');
                } else if (action === 'Drop') {
                    await manager.stashDrop(item.worktreePath, picked.index);
                    vscode.window.showInformationMessage('Stash dropped.');
                }
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Stash list failed: ${err}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMultiBranch.mergeBranch', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath) { return; }
            const sourceBranch = item.repoPath
                ? await pickBranch(item.repoPath, 'Select branch to merge into current')
                : await requireInput('Branch to merge into current');
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
        vscode.commands.registerCommand('gitMultiBranch.rebaseBranch', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath) { return; }
            const onto = item.repoPath
                ? await pickBranch(item.repoPath, 'Select branch to rebase onto')
                : await requireInput('Branch to rebase onto');
            if (!onto) { return; }

            try {
                await manager.rebaseBranch(item.worktreePath, onto);
                vscode.window.showInformationMessage(`Rebased onto "${onto}" successfully.`);
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Rebase failed: ${err}`);
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
            const branchName = item.repoPath
                ? await pickBranch(item.repoPath, 'Select branch to checkout')
                : await requireInput('Branch name to checkout');
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
        vscode.commands.registerCommand('gitMultiBranch.renameBranch', async (item: WorktreeTreeItem) => {
            if (!item?.repoPath || !item.branchName) { return; }
            const newName = await requireInput(
                `Rename branch "${item.branchName}" to:`,
                item.branchName
            );
            if (!newName || newName === item.branchName) { return; }

            try {
                await manager.renameBranch(item.repoPath, item.branchName, newName);
                vscode.window.showInformationMessage(`Branch renamed to "${newName}".`);
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Rename branch failed: ${err}`);
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
        vscode.commands.registerCommand('gitMultiBranch.fetchWorktree', async (item: WorktreeTreeItem) => {
            if (!item?.worktreePath) { return; }
            try {
                await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: 'Fetching…' },
                    () => manager.fetch(item.worktreePath!)
                );
                vscode.window.showInformationMessage('Fetch completed.');
                refreshAll();
            } catch (err) {
                vscode.window.showErrorMessage(`Fetch failed: ${err}`);
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
    // Configuration change handler
    // -------------------------------------------------------------------------

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('gitWorktreeStudio.discoveryDepth')) {
                manager.setDiscoveryDepth(getConfig().get<number>('discoveryDepth', 2));
                refreshAll();
            }
            if (e.affectsConfiguration('gitWorktreeStudio.autoRefreshInterval')) {
                restartAutoRefresh();
            }
        })
    );

    // -------------------------------------------------------------------------
    // Auto-refresh: configurable interval + file watcher with 2s debounce
    // -------------------------------------------------------------------------

    let refreshInterval: ReturnType<typeof setInterval> | undefined;

    function restartAutoRefresh(): void {
        if (refreshInterval) { clearInterval(refreshInterval); }
        const interval = getConfig().get<number>('autoRefreshInterval', 30000);
        if (interval > 0) {
            refreshInterval = setInterval(() => refreshAll(), interval);
        }
    }

    restartAutoRefresh();
    context.subscriptions.push({ dispose: () => { if (refreshInterval) { clearInterval(refreshInterval); } } });

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
        vscode.workspace.onDidChangeWorkspaceFolders((e: vscode.WorkspaceFoldersChangeEvent) => {
            const folders = (e.added.concat(
                vscode.workspace.workspaceFolders?.filter(
                    (f: vscode.WorkspaceFolder) => !e.removed.some((r: vscode.WorkspaceFolder) => r.uri.fsPath === f.uri.fsPath)
                ) ?? []
            )).map((f: vscode.WorkspaceFolder) => f.uri.fsPath);
            manager.updateWorkspaceFolders(folders);
            refreshAll();
        })
    );

    // Initial load
    changesProvider.refreshData();
    updateStatusBar();
}

export function deactivate(): void {
    // nothing to clean up beyond subscriptions
}
