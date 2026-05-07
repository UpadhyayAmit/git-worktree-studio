"use strict";
/**
 * Git Worktree Studio — MCP Server
 *
 * Protocol:  MCP v2024-11-05 over stdio (JSON-RPC 2.0)
 * Tools:     18 tools for AI model integration
 * Author:    Amit Upadhyay
 */
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
const readline = __importStar(require("readline"));
const gitWorktreeManager_1 = require("../gitWorktreeManager");
// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
const TOOLS = [
    {
        name: 'list_repos',
        description: 'Discover all git repositories in the workspace with their branches and worktrees.',
        inputSchema: {
            type: 'object',
            properties: {
                workspacePath: { type: 'string', description: 'Absolute path to the workspace root.' }
            },
            required: ['workspacePath']
        }
    },
    {
        name: 'create_branch',
        description: 'Create a new git worktree branch for parallel development.',
        inputSchema: {
            type: 'object',
            properties: {
                repoPath: { type: 'string', description: 'Absolute path to the git repository.' },
                branchName: { type: 'string', description: 'Name for the new branch.' }
            },
            required: ['repoPath', 'branchName']
        }
    },
    {
        name: 'remove_branch',
        description: 'Remove a git worktree.',
        inputSchema: {
            type: 'object',
            properties: {
                repoPath: { type: 'string', description: 'Absolute path to the main git repository.' },
                worktreePath: { type: 'string', description: 'Absolute path to the worktree to remove.' }
            },
            required: ['repoPath', 'worktreePath']
        }
    },
    {
        name: 'get_branch_info',
        description: 'Get current branch, ahead/behind counts, and remote URL for a worktree.',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' }
            },
            required: ['worktreePath']
        }
    },
    {
        name: 'list_changes',
        description: 'List modified/untracked files in a branch worktree.',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' }
            },
            required: ['worktreePath']
        }
    },
    {
        name: 'read_file',
        description: 'Read file contents from any branch worktree.',
        inputSchema: {
            type: 'object',
            properties: {
                filePath: { type: 'string', description: 'Absolute path to the file.' }
            },
            required: ['filePath']
        }
    },
    {
        name: 'write_file',
        description: 'Write or create a file in any branch worktree.',
        inputSchema: {
            type: 'object',
            properties: {
                filePath: { type: 'string', description: 'Absolute path to the file.' },
                content: { type: 'string', description: 'Content to write.' }
            },
            required: ['filePath', 'content']
        }
    },
    {
        name: 'diff',
        description: 'Get git diff for a specific file or all changes in a worktree.',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' },
                filePath: { type: 'string', description: 'Relative path to file (optional; omit for full diff).' }
            },
            required: ['worktreePath']
        }
    },
    {
        name: 'stage_files',
        description: 'Stage files for commit.',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' },
                files: { type: 'string', description: 'Comma-separated list of file paths relative to worktree, or "." to stage all.' }
            },
            required: ['worktreePath', 'files']
        }
    },
    {
        name: 'unstage_files',
        description: 'Unstage files.',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' },
                files: { type: 'string', description: 'Comma-separated list of file paths relative to worktree.' }
            },
            required: ['worktreePath', 'files']
        }
    },
    {
        name: 'commit',
        description: 'Commit staged changes (optionally staging all first).',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' },
                message: { type: 'string', description: 'Commit message.' },
                stageAll: { type: 'string', description: '"true" to stage all changes before committing.' }
            },
            required: ['worktreePath', 'message']
        }
    },
    {
        name: 'push',
        description: 'Push commits to remote.',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' },
                setUpstream: { type: 'string', description: '"true" to set upstream for new branches.' }
            },
            required: ['worktreePath']
        }
    },
    {
        name: 'pull',
        description: 'Pull from remote (with rebase).',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' }
            },
            required: ['worktreePath']
        }
    },
    {
        name: 'create_pull_request',
        description: 'Create a pull request via gh CLI, az CLI, or browser URL fallback.',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' },
                title: { type: 'string', description: 'PR title.' },
                baseBranch: { type: 'string', description: 'Target base branch (e.g. "main").' },
                body: { type: 'string', description: 'PR description body (optional).' }
            },
            required: ['worktreePath', 'title', 'baseBranch']
        }
    },
    {
        name: 'stash',
        description: 'Stash uncommitted changes.',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' },
                message: { type: 'string', description: 'Stash message (optional).' }
            },
            required: ['worktreePath']
        }
    },
    {
        name: 'stash_pop',
        description: 'Pop the most recent stash.',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' }
            },
            required: ['worktreePath']
        }
    },
    {
        name: 'log',
        description: 'Get recent commits for a worktree.',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' },
                count: { type: 'string', description: 'Number of commits to return (default: 20).' }
            },
            required: ['worktreePath']
        }
    },
    {
        name: 'merge',
        description: 'Merge a branch into the current worktree branch.',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' },
                sourceBranch: { type: 'string', description: 'Branch name to merge in.' }
            },
            required: ['worktreePath', 'sourceBranch']
        }
    },
    {
        name: 'discard_changes',
        description: 'Discard uncommitted changes to a file.',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' },
                filePath: { type: 'string', description: 'Relative path to the file to discard.' }
            },
            required: ['worktreePath', 'filePath']
        }
    }
];
// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------
async function callTool(manager, toolName, args) {
    switch (toolName) {
        case 'list_repos': {
            const workspacePath = args.workspacePath;
            manager.updateWorkspaceFolders([workspacePath]);
            const repos = await manager.discoverRepos();
            return { repos };
        }
        case 'create_branch': {
            const worktreePath = await manager.createWorktree(args.repoPath, args.branchName);
            return { worktreePath, message: `Worktree created at ${worktreePath}` };
        }
        case 'remove_branch': {
            await manager.removeWorktree(args.repoPath, args.worktreePath);
            return { message: 'Worktree removed.' };
        }
        case 'get_branch_info': {
            const info = await manager.getBranchInfo(args.worktreePath);
            return info;
        }
        case 'list_changes': {
            const changes = await manager.getChangedFiles(args.worktreePath, args.worktreePath);
            return { changes };
        }
        case 'read_file': {
            const content = manager.readFile(args.filePath);
            return { content };
        }
        case 'write_file': {
            manager.writeFile(args.filePath, args.content);
            return { message: `File written: ${args.filePath}` };
        }
        case 'diff': {
            const diff = await manager.getDiff(args.worktreePath, args.filePath || undefined);
            return { diff };
        }
        case 'stage_files': {
            if (args.files === '.') {
                await manager.stageAll(args.worktreePath);
            }
            else {
                const files = args.files.split(',').map(f => f.trim()).filter(Boolean);
                for (const f of files) {
                    await manager.stageFile(args.worktreePath, f);
                }
            }
            return { message: 'Files staged.' };
        }
        case 'unstage_files': {
            const files = args.files.split(',').map(f => f.trim()).filter(Boolean);
            for (const f of files) {
                await manager.unstageFile(args.worktreePath, f);
            }
            return { message: 'Files unstaged.' };
        }
        case 'commit': {
            await manager.commit(args.worktreePath, args.message, args.stageAll === 'true');
            return { message: 'Committed successfully.' };
        }
        case 'push': {
            await manager.push(args.worktreePath, args.setUpstream === 'true');
            return { message: 'Pushed successfully.' };
        }
        case 'pull': {
            await manager.pull(args.worktreePath);
            return { message: 'Pulled successfully.' };
        }
        case 'create_pull_request': {
            const url = await manager.createPR(args.worktreePath, args.title, args.baseBranch, args.body ?? '');
            return { url, message: `PR created: ${url}` };
        }
        case 'stash': {
            await manager.stash(args.worktreePath, args.message || undefined);
            return { message: 'Changes stashed.' };
        }
        case 'stash_pop': {
            await manager.stashPop(args.worktreePath);
            return { message: 'Stash popped.' };
        }
        case 'log': {
            const count = args.count ? parseInt(args.count, 10) : 20;
            const log = await manager.getLog(args.worktreePath, count);
            return { log };
        }
        case 'merge': {
            await manager.mergeBranch(args.worktreePath, args.sourceBranch);
            return { message: `Merged "${args.sourceBranch}" successfully.` };
        }
        case 'discard_changes': {
            await manager.discardFile(args.worktreePath, args.filePath);
            return { message: `Discarded changes to ${args.filePath}` };
        }
        default:
            throw new Error(`Unknown tool: ${toolName}`);
    }
}
// ---------------------------------------------------------------------------
// JSON-RPC dispatch
// ---------------------------------------------------------------------------
function makeError(id, code, message) {
    return { jsonrpc: '2.0', id, error: { code, message } };
}
function makeResult(id, result) {
    return { jsonrpc: '2.0', id, result };
}
async function handleRequest(req, manager) {
    const { id, method, params } = req;
    if (method === 'initialize') {
        return makeResult(id, {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'git-worktree-studio', version: '0.3.0' }
        });
    }
    if (method === 'initialized') {
        return null; // notification — no response
    }
    if (method === 'tools/list') {
        return makeResult(id, { tools: TOOLS });
    }
    if (method === 'tools/call') {
        const toolName = params?.name ?? '';
        const toolArgs = params?.arguments ?? {};
        if (!toolName) {
            return makeError(id, -32602, 'Missing tool name.');
        }
        try {
            const result = await callTool(manager, toolName, toolArgs);
            return makeResult(id, {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return makeResult(id, {
                content: [{ type: 'text', text: `Error: ${msg}` }],
                isError: true
            });
        }
    }
    return makeError(id, -32601, `Method not found: ${method}`);
}
// ---------------------------------------------------------------------------
// Main: stdio server loop
// ---------------------------------------------------------------------------
function main() {
    // Manager starts with no workspace; list_repos tool sets it dynamically
    const manager = new gitWorktreeManager_1.GitWorktreeManager([]);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });
    process.stdout.write(''); // keep stdout open
    rl.on('line', async (line) => {
        const trimmed = line.trim();
        if (!trimmed) {
            return;
        }
        let req;
        try {
            req = JSON.parse(trimmed);
        }
        catch {
            const resp = makeError(null, -32700, 'Parse error');
            process.stdout.write(JSON.stringify(resp) + '\n');
            return;
        }
        if (req.jsonrpc !== '2.0') {
            const resp = makeError(req.id ?? null, -32600, 'Invalid JSON-RPC version');
            process.stdout.write(JSON.stringify(resp) + '\n');
            return;
        }
        try {
            const response = await handleRequest(req, manager);
            if (response !== null) {
                process.stdout.write(JSON.stringify(response) + '\n');
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const resp = makeError(req.id ?? null, -32603, `Internal error: ${msg}`);
            process.stdout.write(JSON.stringify(resp) + '\n');
        }
    });
    rl.on('close', () => {
        process.exit(0);
    });
}
main();
//# sourceMappingURL=server.js.map