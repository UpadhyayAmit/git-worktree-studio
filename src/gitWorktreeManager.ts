import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface RepoInfo {
    repoPath: string;
    name: string;
    currentBranch: string;
    worktrees: WorktreeInfo[];
}

export interface WorktreeInfo {
    worktreePath: string;
    branch: string;
    isMain: boolean;
    ahead: number;
    behind: number;
    changedFiles: FileChange[];
}

export interface FileChange {
    status: string;
    filePath: string;
    worktreePath: string;
    repoPath: string;
}

export class GitWorktreeManager {
    private workspaceFolders: string[];

    constructor(workspaceFolders: string[]) {
        this.workspaceFolders = workspaceFolders;
    }

    updateWorkspaceFolders(folders: string[]): void {
        this.workspaceFolders = folders;
    }

    // -------------------------------------------------------------------------
    // Repo discovery
    // -------------------------------------------------------------------------

    async discoverRepos(): Promise<RepoInfo[]> {
        const repos: RepoInfo[] = [];
        const seen = new Set<string>();

        for (const folder of this.workspaceFolders) {
            await this.findGitRepos(folder, 0, 2, repos, seen);
        }

        return repos;
    }

    private async findGitRepos(
        dir: string,
        depth: number,
        maxDepth: number,
        repos: RepoInfo[],
        seen: Set<string>
    ): Promise<void> {
        if (depth > maxDepth) { return; }

        const gitDir = path.join(dir, '.git');
        if (fs.existsSync(gitDir)) {
            if (!seen.has(dir)) {
                seen.add(dir);
                const repo = await this.buildRepoInfo(dir);
                if (repo) { repos.push(repo); }
            }
            return; // don't recurse inside a git repo
        }

        if (depth < maxDepth) {
            let entries: fs.Dirent[];
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            } catch {
                return;
            }
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    await this.findGitRepos(
                        path.join(dir, entry.name),
                        depth + 1,
                        maxDepth,
                        repos,
                        seen
                    );
                }
            }
        }
    }

    private async buildRepoInfo(repoPath: string): Promise<RepoInfo | null> {
        try {
            const currentBranch = await this.getCurrentBranch(repoPath);
            const worktrees = await this.listWorktrees(repoPath);
            return {
                repoPath,
                name: path.basename(repoPath),
                currentBranch,
                worktrees
            };
        } catch {
            return null;
        }
    }

    // -------------------------------------------------------------------------
    // Branch / worktree helpers
    // -------------------------------------------------------------------------

    async getCurrentBranch(repoPath: string): Promise<string> {
        try {
            return this.execGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath).trim();
        } catch {
            return 'unknown';
        }
    }

    async listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
        const output = this.execGit(['worktree', 'list', '--porcelain'], repoPath);
        const blocks = output.trim().split(/\n\n+/);
        const worktrees: WorktreeInfo[] = [];

        for (const block of blocks) {
            const lines = block.trim().split('\n');
            let worktreePath = '';
            let branch = '';
            let isMain = false;

            for (const line of lines) {
                if (line.startsWith('worktree ')) {
                    worktreePath = line.slice('worktree '.length).trim();
                } else if (line.startsWith('branch ')) {
                    branch = line.slice('branch '.length).trim().replace('refs/heads/', '');
                } else if (line === 'bare') {
                    branch = '(bare)';
                }
            }

            if (!worktreePath) { continue; }

            // The first worktree listed is the main one
            isMain = worktrees.length === 0;

            const [ahead, behind] = await this.getAheadBehind(worktreePath);
            const changedFiles = await this.getChangedFiles(worktreePath, repoPath);

            worktrees.push({ worktreePath, branch, isMain, ahead, behind, changedFiles });
        }

        return worktrees;
    }

    async getAheadBehind(worktreePath: string): Promise<[number, number]> {
        try {
            const out = this.execGit(
                ['rev-list', '--left-right', '--count', '@{u}...HEAD'],
                worktreePath
            ).trim();
            const parts = out.split(/\s+/);
            return [parseInt(parts[1] ?? '0', 10), parseInt(parts[0] ?? '0', 10)];
        } catch {
            return [0, 0];
        }
    }

    async getChangedFiles(worktreePath: string, repoPath: string): Promise<FileChange[]> {
        try {
            const out = this.execGit(['status', '--porcelain'], worktreePath);
            const changes: FileChange[] = [];
            for (const line of out.split('\n')) {
                if (!line.trim()) { continue; }
                const status = line.substring(0, 2).trim();
                const filePath = line.substring(3).trim().replace(/ -> .+$/, '');
                changes.push({ status, filePath, worktreePath, repoPath });
            }
            return changes;
        } catch {
            return [];
        }
    }

    // -------------------------------------------------------------------------
    // Worktree CRUD
    // -------------------------------------------------------------------------

    async createWorktree(repoPath: string, branchName: string): Promise<string> {
        const safeName = branchName.replace(/[/\\]/g, '-');
        const parentDir = path.dirname(repoPath);
        const repoName = path.basename(repoPath);
        const worktreePath = path.join(parentDir, `${repoName}-wt-${safeName}`);

        // Check if branch already exists
        const branches = this.execGit(['branch', '--list', branchName], repoPath).trim();
        if (branches) {
            this.execGit(['worktree', 'add', worktreePath, branchName], repoPath);
        } else {
            this.execGit(['worktree', 'add', '-b', branchName, worktreePath], repoPath);
        }

        return worktreePath;
    }

    async removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
        this.execGit(['worktree', 'remove', '--force', worktreePath], repoPath);
    }

    // -------------------------------------------------------------------------
    // File-level operations
    // -------------------------------------------------------------------------

    async stageFile(worktreePath: string, filePath: string): Promise<void> {
        this.execGit(['add', filePath], worktreePath);
    }

    async unstageFile(worktreePath: string, filePath: string): Promise<void> {
        this.execGit(['reset', 'HEAD', '--', filePath], worktreePath);
    }

    async discardFile(worktreePath: string, filePath: string): Promise<void> {
        this.execGit(['checkout', '--', filePath], worktreePath);
    }

    async stageAll(worktreePath: string): Promise<void> {
        this.execGit(['add', '-A'], worktreePath);
    }

    // -------------------------------------------------------------------------
    // Commit / push / pull
    // -------------------------------------------------------------------------

    async commit(worktreePath: string, message: string, stageAll = false): Promise<void> {
        if (stageAll) {
            this.execGit(['add', '-A'], worktreePath);
        }
        this.execGit(['commit', '-m', message], worktreePath);
    }

    async push(worktreePath: string, setUpstream = false): Promise<void> {
        if (setUpstream) {
            const branch = await this.getCurrentBranch(worktreePath);
            this.execGit(['push', '--set-upstream', 'origin', branch], worktreePath);
        } else {
            this.execGit(['push'], worktreePath);
        }
    }

    async pull(worktreePath: string): Promise<void> {
        this.execGit(['pull', '--rebase'], worktreePath);
    }

    async sync(worktreePath: string): Promise<void> {
        await this.pull(worktreePath);
        await this.push(worktreePath);
    }

    async fetchAll(repoPath: string): Promise<void> {
        this.execGit(['fetch', '--all', '--prune'], repoPath);
    }

    // -------------------------------------------------------------------------
    // Branch management
    // -------------------------------------------------------------------------

    async switchBranch(worktreePath: string, branchName: string): Promise<void> {
        this.execGit(['checkout', branchName], worktreePath);
    }

    async deleteBranch(repoPath: string, branchName: string): Promise<void> {
        this.execGit(['branch', '-D', branchName], repoPath);
    }

    async mergeBranch(worktreePath: string, sourceBranch: string): Promise<void> {
        this.execGit(['merge', sourceBranch], worktreePath);
    }

    // -------------------------------------------------------------------------
    // Stash
    // -------------------------------------------------------------------------

    async stash(worktreePath: string, message?: string): Promise<void> {
        if (message) {
            this.execGit(['stash', 'push', '-m', message], worktreePath);
        } else {
            this.execGit(['stash', 'push'], worktreePath);
        }
    }

    async stashPop(worktreePath: string): Promise<void> {
        this.execGit(['stash', 'pop'], worktreePath);
    }

    // -------------------------------------------------------------------------
    // Log / diff
    // -------------------------------------------------------------------------

    async getLog(worktreePath: string, count = 20): Promise<string> {
        return this.execGit(
            ['log', `--max-count=${count}`, '--oneline', '--graph', '--decorate'],
            worktreePath
        );
    }

    async getDiff(worktreePath: string, filePath?: string): Promise<string> {
        if (filePath) {
            return this.execGit(['diff', 'HEAD', '--', filePath], worktreePath);
        }
        return this.execGit(['diff', 'HEAD'], worktreePath);
    }

    async getBranchInfo(worktreePath: string): Promise<{
        branch: string;
        ahead: number;
        behind: number;
        remoteUrl: string;
    }> {
        const branch = await this.getCurrentBranch(worktreePath);
        const [ahead, behind] = await this.getAheadBehind(worktreePath);
        let remoteUrl = '';
        try {
            remoteUrl = this.execGit(['remote', 'get-url', 'origin'], worktreePath).trim();
        } catch { /* no remote */ }
        return { branch, ahead, behind, remoteUrl };
    }

    // -------------------------------------------------------------------------
    // PR creation
    // -------------------------------------------------------------------------

    async createPR(
        worktreePath: string,
        title: string,
        baseBranch: string,
        body = ''
    ): Promise<string> {
        // Try gh CLI first
        try {
            const result = this.execGit(
                // gh is not git, but we can still spawn it similarly
                ['pr', 'create', '--title', title, '--base', baseBranch, '--body', body],
                worktreePath,
                'gh'
            );
            return result.trim();
        } catch { /* fall through */ }

        // Try az CLI
        try {
            const branch = await this.getCurrentBranch(worktreePath);
            const result = this.exec(
                'az',
                ['repos', 'pr', 'create', '--title', title, '--source-branch', branch, '--target-branch', baseBranch],
                worktreePath
            );
            return result.trim();
        } catch { /* fall through */ }

        // Fallback: open browser
        let remoteUrl = '';
        try {
            remoteUrl = this.execGit(['remote', 'get-url', 'origin'], worktreePath).trim();
        } catch { /* no remote */ }

        if (remoteUrl) {
            const branch = await this.getCurrentBranch(worktreePath);
            const ghUrl = remoteUrl
                .replace(/\.git$/, '')
                .replace('git@github.com:', 'https://github.com/');
            return `${ghUrl}/compare/${baseBranch}...${branch}?quick_pull=1`;
        }

        throw new Error('Unable to create PR: no supported CLI found and no remote URL available');
    }

    // -------------------------------------------------------------------------
    // File I/O helpers (used by MCP server)
    // -------------------------------------------------------------------------

    readFile(filePath: string): string {
        return fs.readFileSync(filePath, 'utf8');
    }

    writeFile(filePath: string, content: string): void {
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
    }

    // -------------------------------------------------------------------------
    // Low-level exec helpers
    // -------------------------------------------------------------------------

    private execGit(args: string[], cwd: string, cmd = 'git'): string {
        return this.exec(cmd, args, cwd);
    }

    private exec(cmd: string, args: string[], cwd: string): string {
        const result = cp.spawnSync(cmd, args, {
            cwd,
            encoding: 'utf8',
            windowsHide: true
        });
        if (result.error) { throw result.error; }
        if (result.status !== 0) {
            throw new Error(result.stderr || `${cmd} exited with code ${result.status}`);
        }
        return result.stdout ?? '';
    }
}
