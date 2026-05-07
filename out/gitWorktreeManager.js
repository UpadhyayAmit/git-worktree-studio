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
exports.GitWorktreeManager = void 0;
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class GitWorktreeManager {
    constructor(workspaceFolders) {
        this.workspaceFolders = workspaceFolders;
    }
    updateWorkspaceFolders(folders) {
        this.workspaceFolders = folders;
    }
    // -------------------------------------------------------------------------
    // Repo discovery
    // -------------------------------------------------------------------------
    async discoverRepos() {
        const repos = [];
        const seen = new Set();
        for (const folder of this.workspaceFolders) {
            await this.findGitRepos(folder, 0, 2, repos, seen);
        }
        return repos;
    }
    async findGitRepos(dir, depth, maxDepth, repos, seen) {
        if (depth > maxDepth) {
            return;
        }
        const gitDir = path.join(dir, '.git');
        if (fs.existsSync(gitDir)) {
            if (!seen.has(dir)) {
                seen.add(dir);
                const repo = await this.buildRepoInfo(dir);
                if (repo) {
                    repos.push(repo);
                }
            }
            return; // don't recurse inside a git repo
        }
        if (depth < maxDepth) {
            let entries;
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    await this.findGitRepos(path.join(dir, entry.name), depth + 1, maxDepth, repos, seen);
                }
            }
        }
    }
    async buildRepoInfo(repoPath) {
        try {
            const currentBranch = await this.getCurrentBranch(repoPath);
            const worktrees = await this.listWorktrees(repoPath);
            return {
                repoPath,
                name: path.basename(repoPath),
                currentBranch,
                worktrees
            };
        }
        catch {
            return null;
        }
    }
    // -------------------------------------------------------------------------
    // Branch / worktree helpers
    // -------------------------------------------------------------------------
    async getCurrentBranch(repoPath) {
        try {
            return this.execGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath).trim();
        }
        catch {
            return 'unknown';
        }
    }
    async listWorktrees(repoPath) {
        const output = this.execGit(['worktree', 'list', '--porcelain'], repoPath);
        const blocks = output.trim().split(/\n\n+/);
        const worktrees = [];
        for (const block of blocks) {
            const lines = block.trim().split('\n');
            let worktreePath = '';
            let branch = '';
            let isMain = false;
            for (const line of lines) {
                if (line.startsWith('worktree ')) {
                    worktreePath = line.slice('worktree '.length).trim();
                }
                else if (line.startsWith('branch ')) {
                    branch = line.slice('branch '.length).trim().replace('refs/heads/', '');
                }
                else if (line === 'bare') {
                    branch = '(bare)';
                }
            }
            if (!worktreePath) {
                continue;
            }
            // The first worktree listed is the main one
            isMain = worktrees.length === 0;
            const [ahead, behind] = await this.getAheadBehind(worktreePath);
            const changedFiles = await this.getChangedFiles(worktreePath, repoPath);
            worktrees.push({ worktreePath, branch, isMain, ahead, behind, changedFiles });
        }
        return worktrees;
    }
    async getAheadBehind(worktreePath) {
        try {
            const out = this.execGit(['rev-list', '--left-right', '--count', '@{u}...HEAD'], worktreePath).trim();
            const parts = out.split(/\s+/);
            return [parseInt(parts[1] ?? '0', 10), parseInt(parts[0] ?? '0', 10)];
        }
        catch {
            return [0, 0];
        }
    }
    async getChangedFiles(worktreePath, repoPath) {
        try {
            const out = this.execGit(['status', '--porcelain'], worktreePath);
            const changes = [];
            for (const line of out.split('\n')) {
                if (!line.trim()) {
                    continue;
                }
                const status = line.substring(0, 2).trim();
                const filePath = line.substring(3).trim().replace(/ -> .+$/, '');
                changes.push({ status, filePath, worktreePath, repoPath });
            }
            return changes;
        }
        catch {
            return [];
        }
    }
    // -------------------------------------------------------------------------
    // Worktree CRUD
    // -------------------------------------------------------------------------
    async createWorktree(repoPath, branchName) {
        const safeName = branchName.replace(/[/\\]/g, '-');
        const parentDir = path.dirname(repoPath);
        const repoName = path.basename(repoPath);
        const worktreePath = path.join(parentDir, `${repoName}-wt-${safeName}`);
        // Check if branch already exists
        const branches = this.execGit(['branch', '--list', branchName], repoPath).trim();
        if (branches) {
            this.execGit(['worktree', 'add', worktreePath, branchName], repoPath);
        }
        else {
            this.execGit(['worktree', 'add', '-b', branchName, worktreePath], repoPath);
        }
        return worktreePath;
    }
    async removeWorktree(repoPath, worktreePath) {
        this.execGit(['worktree', 'remove', '--force', worktreePath], repoPath);
    }
    // -------------------------------------------------------------------------
    // File-level operations
    // -------------------------------------------------------------------------
    async stageFile(worktreePath, filePath) {
        this.execGit(['add', filePath], worktreePath);
    }
    async unstageFile(worktreePath, filePath) {
        this.execGit(['reset', 'HEAD', '--', filePath], worktreePath);
    }
    async discardFile(worktreePath, filePath) {
        this.execGit(['checkout', '--', filePath], worktreePath);
    }
    async stageAll(worktreePath) {
        this.execGit(['add', '-A'], worktreePath);
    }
    // -------------------------------------------------------------------------
    // Commit / push / pull
    // -------------------------------------------------------------------------
    async commit(worktreePath, message, stageAll = false) {
        if (stageAll) {
            this.execGit(['add', '-A'], worktreePath);
        }
        this.execGit(['commit', '-m', message], worktreePath);
    }
    async push(worktreePath, setUpstream = false) {
        if (setUpstream) {
            const branch = await this.getCurrentBranch(worktreePath);
            this.execGit(['push', '--set-upstream', 'origin', branch], worktreePath);
        }
        else {
            this.execGit(['push'], worktreePath);
        }
    }
    async pull(worktreePath) {
        this.execGit(['pull', '--rebase'], worktreePath);
    }
    async sync(worktreePath) {
        await this.pull(worktreePath);
        await this.push(worktreePath);
    }
    async fetchAll(repoPath) {
        this.execGit(['fetch', '--all', '--prune'], repoPath);
    }
    // -------------------------------------------------------------------------
    // Branch management
    // -------------------------------------------------------------------------
    async switchBranch(worktreePath, branchName) {
        this.execGit(['checkout', branchName], worktreePath);
    }
    async deleteBranch(repoPath, branchName) {
        this.execGit(['branch', '-D', branchName], repoPath);
    }
    async mergeBranch(worktreePath, sourceBranch) {
        this.execGit(['merge', sourceBranch], worktreePath);
    }
    // -------------------------------------------------------------------------
    // Stash
    // -------------------------------------------------------------------------
    async stash(worktreePath, message) {
        if (message) {
            this.execGit(['stash', 'push', '-m', message], worktreePath);
        }
        else {
            this.execGit(['stash', 'push'], worktreePath);
        }
    }
    async stashPop(worktreePath) {
        this.execGit(['stash', 'pop'], worktreePath);
    }
    // -------------------------------------------------------------------------
    // Log / diff
    // -------------------------------------------------------------------------
    async getLog(worktreePath, count = 20) {
        return this.execGit(['log', `--max-count=${count}`, '--oneline', '--graph', '--decorate'], worktreePath);
    }
    async getDiff(worktreePath, filePath) {
        if (filePath) {
            return this.execGit(['diff', 'HEAD', '--', filePath], worktreePath);
        }
        return this.execGit(['diff', 'HEAD'], worktreePath);
    }
    async getBranchInfo(worktreePath) {
        const branch = await this.getCurrentBranch(worktreePath);
        const [ahead, behind] = await this.getAheadBehind(worktreePath);
        let remoteUrl = '';
        try {
            remoteUrl = this.execGit(['remote', 'get-url', 'origin'], worktreePath).trim();
        }
        catch { /* no remote */ }
        return { branch, ahead, behind, remoteUrl };
    }
    // -------------------------------------------------------------------------
    // PR creation
    // -------------------------------------------------------------------------
    async createPR(worktreePath, title, baseBranch, body = '') {
        // Try gh CLI first
        try {
            const result = this.execGit(
            // gh is not git, but we can still spawn it similarly
            ['pr', 'create', '--title', title, '--base', baseBranch, '--body', body], worktreePath, 'gh');
            return result.trim();
        }
        catch { /* fall through */ }
        // Try az CLI
        try {
            const branch = await this.getCurrentBranch(worktreePath);
            const result = this.exec('az', ['repos', 'pr', 'create', '--title', title, '--source-branch', branch, '--target-branch', baseBranch], worktreePath);
            return result.trim();
        }
        catch { /* fall through */ }
        // Fallback: open browser
        let remoteUrl = '';
        try {
            remoteUrl = this.execGit(['remote', 'get-url', 'origin'], worktreePath).trim();
        }
        catch { /* no remote */ }
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
    readFile(filePath) {
        return fs.readFileSync(filePath, 'utf8');
    }
    writeFile(filePath, content) {
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
    }
    // -------------------------------------------------------------------------
    // Low-level exec helpers
    // -------------------------------------------------------------------------
    execGit(args, cwd, cmd = 'git') {
        return this.exec(cmd, args, cwd);
    }
    exec(cmd, args, cwd) {
        const result = cp.spawnSync(cmd, args, {
            cwd,
            encoding: 'utf8',
            windowsHide: true
        });
        if (result.error) {
            throw result.error;
        }
        if (result.status !== 0) {
            throw new Error(result.stderr || `${cmd} exited with code ${result.status}`);
        }
        return result.stdout ?? '';
    }
}
exports.GitWorktreeManager = GitWorktreeManager;
//# sourceMappingURL=gitWorktreeManager.js.map