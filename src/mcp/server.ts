/**
 * Git Worktree Studio — MCP Server
 *
 * Protocol:  MCP v2024-11-05 over stdio (JSON-RPC 2.0)
 * Tools:     19 tools for AI model integration
 * Author:    Amit Upadhyay
 */

import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';
import { GitWorktreeManager } from '../gitWorktreeManager';

// ---------------------------------------------------------------------------
// JSON-RPC types
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: number | string | null;
    method: string;
    params?: Record<string, unknown>;
}

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: number | string | null;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
}

// ---------------------------------------------------------------------------
// MCP Tool definition
// ---------------------------------------------------------------------------

interface McpTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, { type: string; description: string }>;
        required?: string[];
    };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS: McpTool[] = [
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
    },
    {
        name: 'fetch',
        description: 'Fetch from all remotes in a worktree (prunes deleted remote branches).',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' }
            },
            required: ['worktreePath']
        }
    },
    {
        name: 'list_stashes',
        description: 'List all stashes in a worktree.',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' }
            },
            required: ['worktreePath']
        }
    },
    {
        name: 'stash_drop',
        description: 'Drop a specific stash by index.',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' },
                index: { type: 'string', description: 'Stash index to drop (default: 0).' }
            },
            required: ['worktreePath']
        }
    },
    {
        name: 'switch_branch',
        description: 'Checkout a branch in a worktree.',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' },
                branchName: { type: 'string', description: 'Branch name to checkout.' }
            },
            required: ['worktreePath', 'branchName']
        }
    },
    {
        name: 'rename_branch',
        description: 'Rename a local branch.',
        inputSchema: {
            type: 'object',
            properties: {
                repoPath: { type: 'string', description: 'Absolute path to the git repository.' },
                oldName: { type: 'string', description: 'Current branch name.' },
                newName: { type: 'string', description: 'New branch name.' }
            },
            required: ['repoPath', 'oldName', 'newName']
        }
    },
    {
        name: 'list_branches',
        description: 'List all local and remote branches in a repository.',
        inputSchema: {
            type: 'object',
            properties: {
                repoPath: { type: 'string', description: 'Absolute path to the git repository.' }
            },
            required: ['repoPath']
        }
    },
    {
        name: 'rebase',
        description: 'Rebase the current worktree branch onto another branch.',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' },
                onto: { type: 'string', description: 'Branch to rebase onto.' }
            },
            required: ['worktreePath', 'onto']
        }
    },
    {
        name: 'amend_commit',
        description: 'Amend the last commit, optionally with a new message.',
        inputSchema: {
            type: 'object',
            properties: {
                worktreePath: { type: 'string', description: 'Absolute path to the worktree.' },
                message: { type: 'string', description: 'New commit message (optional; omit to keep existing).' }
            },
            required: ['worktreePath']
        }
    }
];

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

async function callTool(
    manager: GitWorktreeManager,
    toolName: string,
    args: Record<string, string>
): Promise<unknown> {
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
            } else {
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
            await manager.commit(
                args.worktreePath,
                args.message,
                args.stageAll === 'true'
            );
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
            const url = await manager.createPR(
                args.worktreePath,
                args.title,
                args.baseBranch,
                args.body ?? ''
            );
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

        case 'fetch': {
            await manager.fetch(args.worktreePath);
            return { message: 'Fetch completed.' };
        }

        case 'list_stashes': {
            const stashes = await manager.listStashes(args.worktreePath);
            return { stashes };
        }

        case 'stash_drop': {
            const index = args.index ? parseInt(args.index, 10) : 0;
            await manager.stashDrop(args.worktreePath, index);
            return { message: `Stash ${index} dropped.` };
        }

        case 'switch_branch': {
            await manager.switchBranch(args.worktreePath, args.branchName);
            return { message: `Switched to "${args.branchName}".` };
        }

        case 'rename_branch': {
            await manager.renameBranch(args.repoPath, args.oldName, args.newName);
            return { message: `Branch renamed from "${args.oldName}" to "${args.newName}".` };
        }

        case 'list_branches': {
            const branches = await manager.listAllBranches(args.repoPath);
            return branches;
        }

        case 'rebase': {
            await manager.rebaseBranch(args.worktreePath, args.onto);
            return { message: `Rebased onto "${args.onto}" successfully.` };
        }

        case 'amend_commit': {
            await manager.amendCommit(args.worktreePath, args.message || undefined);
            return { message: 'Commit amended successfully.' };
        }

        default:
            throw new Error(`Unknown tool: ${toolName}`);
    }
}

// ---------------------------------------------------------------------------
// JSON-RPC dispatch
// ---------------------------------------------------------------------------

function makeError(id: number | string | null, code: number, message: string): JsonRpcResponse {
    return { jsonrpc: '2.0', id, error: { code, message } };
}

function makeResult(id: number | string | null, result: unknown): JsonRpcResponse {
    return { jsonrpc: '2.0', id, result };
}

async function handleRequest(
    req: JsonRpcRequest,
    manager: GitWorktreeManager
): Promise<JsonRpcResponse | null> {
    const { id, method, params } = req;

    if (method === 'initialize') {
        return makeResult(id, {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'git-worktree-studio', version: '0.4.0' }
        });
    }

    if (method === 'initialized') {
        return null; // notification — no response
    }

    if (method === 'tools/list') {
        return makeResult(id, { tools: TOOLS });
    }

    if (method === 'tools/call') {
        const toolName = (params?.name as string) ?? '';
        const toolArgs = (params?.arguments as Record<string, string>) ?? {};

        if (!toolName) {
            return makeError(id, -32602, 'Missing tool name.');
        }

        try {
            const result = await callTool(manager, toolName, toolArgs);
            return makeResult(id, {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
            });
        } catch (err) {
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

function main(): void {
    // Manager starts with no workspace; list_repos tool sets it dynamically
    const manager = new GitWorktreeManager([]);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });

    process.stdout.write(''); // keep stdout open

    rl.on('line', async (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) { return; }

        let req: JsonRpcRequest;
        try {
            req = JSON.parse(trimmed) as JsonRpcRequest;
        } catch {
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
        } catch (err) {
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
