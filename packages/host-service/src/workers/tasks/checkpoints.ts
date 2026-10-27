import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { TurnChangedFile, TurnChanges } from "@superset/chat-runtime";
import type { SimpleGit } from "simple-git";
import { createUserSimpleGit } from "../../runtime/git/simple-git.ts";
import { defineWorkerTask } from "../define-worker-task.ts";

const GIT_TIMEOUT_MS = 15_000;
const CHECKPOINT_IDENTITY = {
	GIT_AUTHOR_NAME: "Superset",
	GIT_AUTHOR_EMAIL: "checkpoints@superset.sh",
	GIT_COMMITTER_NAME: "Superset",
	GIT_COMMITTER_EMAIL: "checkpoints@superset.sh",
};
export const SHARED_TURN_TRAILER = "Superset-Shared-Turn: true";

export type TurnSnapshot = "before" | "after" | "live";

function refSegment(id: string): string {
	return id.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function turnRef(
	sessionId: string,
	turnId: string,
	snapshot: TurnSnapshot,
): string {
	return `refs/superset/chat-turns/${refSegment(sessionId)}/${refSegment(turnId)}/${snapshot}`;
}

function gitAt(
	cwd: string,
	env?: Record<string, string>,
	abort?: AbortSignal,
): SimpleGit {
	return createUserSimpleGit(cwd, {
		timeout: { block: GIT_TIMEOUT_MS },
		...(abort ? { abort } : {}),
		env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", ...env },
	});
}

type Repo = { root: string; index: string };

async function repoAt(cwd: string): Promise<Repo | null> {
	const [root, index] = await gitAt(cwd)
		.raw(["rev-parse", "--show-toplevel", "--git-path", "index"])
		.then((out) => out.trim().split("\n"))
		.catch(() => []);
	return root && index ? { root, index: resolve(cwd, index) } : null;
}

/**
 * Runs git against a private copy of the index, so the user's staging area,
 * HEAD and branch are never touched. Seeding it from the real index keeps
 * `add -A` cheap: only files whose stat changed are hashed again.
 */
async function withScratchIndex<T>(
	repo: Repo,
	run: (git: SimpleGit) => Promise<T>,
	abort?: AbortSignal,
): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), "superset-checkpoint-"));
	const index = join(dir, "index");
	try {
		await copyFile(repo.index, index).catch(() => undefined);
		return await run(
			gitAt(
				repo.root,
				{ ...CHECKPOINT_IDENTITY, GIT_INDEX_FILE: index },
				abort,
			),
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

async function readRef(git: SimpleGit, ref: string): Promise<string | null> {
	const sha = await git
		.raw(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])
		.then((out) => out.trim())
		.catch(() => "");
	return sha || null;
}

/** The worktree as a commit whose parent is HEAD, so a later diff can tell a moved HEAD apart. */
async function snapshotCommit(
	git: SimpleGit,
	message: string,
): Promise<string> {
	await git.raw(["add", "-A"]);
	const tree = (await git.raw(["write-tree"])).trim();
	const head = await readRef(git, "HEAD");
	return (
		await git.raw([
			"commit-tree",
			tree,
			...(head ? ["-p", head] : []),
			"-m",
			message,
		])
	).trim();
}

function nulFields(output: string): string[] {
	return output.split("\0").filter((field) => field.length > 0);
}

function fileStatus(code: string): TurnChangedFile["status"] {
	if (code.startsWith("A")) return "added";
	if (code.startsWith("D")) return "deleted";
	return "modified";
}

async function diffFiles(
	git: SimpleGit,
	from: string,
	to: string,
): Promise<TurnChangedFile[]> {
	const diff = ["diff", "--no-ext-diff", "--no-renames", "-z"];
	const [numstat, nameStatus] = await Promise.all([
		git.raw([...diff, "--numstat", from, to]),
		git.raw([...diff, "--name-status", from, to]),
	]);
	const statusByPath = new Map<string, TurnChangedFile["status"]>();
	const statusFields = nulFields(nameStatus);
	for (let i = 0; i + 1 < statusFields.length; i += 2) {
		statusByPath.set(
			statusFields[i + 1] as string,
			fileStatus(statusFields[i] as string),
		);
	}
	return nulFields(numstat).map((record) => {
		const [additions = "-", deletions = "-", ...rest] = record.split("\t");
		const path = rest.join("\t");
		const binary = additions === "-" || deletions === "-";
		return {
			path,
			status: statusByPath.get(path) ?? "modified",
			additions: binary ? null : Number(additions),
			deletions: binary ? null : Number(deletions),
		};
	});
}

async function changedNames(git: SimpleGit, args: string[]): Promise<string[]> {
	return nulFields(
		await git.raw([...args, "--name-only", "-z", "--no-renames"]),
	);
}

/**
 * When HEAD moved during the turn, the files the turn really touched: those
 * that differed from HEAD in either snapshot, and those in commits made
 * while it ran. Null when HEAD stayed put, so every file counts.
 */
async function authoredPaths(
	git: SimpleGit,
	before: string,
	after: string,
): Promise<Set<string> | null> {
	const [beforeLine = "", afterLine = ""] = (
		await git.raw([
			"log",
			"--no-walk=unsorted",
			"--format=%ct %P",
			before,
			after,
		])
	)
		.trim()
		.split("\n");
	const [capturedAt = "", beforeHead = ""] = beforeLine.split(" ");
	const [, afterHead = ""] = afterLine.split(" ");
	if (!beforeHead || !afterHead || beforeHead === afterHead) return null;
	const lists = await Promise.all([
		changedNames(git, ["diff", beforeHead, before]),
		changedNames(git, ["diff", afterHead, after]),
		changedNames(git, [
			"log",
			"--format=",
			`--since=@${capturedAt}`,
			`${beforeHead}..${afterHead}`,
		]),
	]);
	return new Set(lists.flat());
}

export const checkpointCaptureTask = defineWorkerTask<
	{
		cwd: string;
		message: string;
		ref?: string;
		/** Refs the new snapshot makes stale. */
		dropRefs?: string[];
		timeoutMs?: number;
	},
	string | null
>({
	type: "checkpoints/capture",
	handler: async ({ cwd, message, ref, dropRefs = [], timeoutMs }) => {
		const repo = await repoAt(cwd);
		if (!repo) return null;
		const commit = await withScratchIndex(
			repo,
			(git) => snapshotCommit(git, message),
			timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
		);
		const git = gitAt(repo.root);
		if (ref) await git.raw(["update-ref", ref, commit]);
		for (const stale of dropRefs) {
			await git.raw(["update-ref", "-d", stale]).catch(() => undefined);
		}
		return commit;
	},
});

export const checkpointRefTask = defineWorkerTask<
	{ cwd: string; ref: string; commit: string },
	void
>({
	type: "checkpoints/ref",
	handler: async ({ cwd, ref, commit }) => {
		await gitAt(cwd).raw(["update-ref", ref, commit]);
	},
});

export const checkpointChangesTask = defineWorkerTask<
	{ cwd: string; sessionId: string; turnId: string; live: boolean },
	TurnChanges | null
>({
	type: "checkpoints/changes",
	handler: async ({ cwd, sessionId, turnId, live }) => {
		const repo = await repoAt(cwd);
		if (!repo) return null;
		const git = gitAt(repo.root);
		const before = await readRef(git, turnRef(sessionId, turnId, "before"));
		if (!before) return null;
		let after: string | null;
		if (live) {
			after = await withScratchIndex(repo, (scratch) =>
				snapshotCommit(scratch, `superset chat turn ${turnId} live`),
			);
			await git.raw(["update-ref", turnRef(sessionId, turnId, "live"), after]);
		} else {
			after = await readRef(git, turnRef(sessionId, turnId, "after"));
		}
		if (!after) return null;
		const [files, authored, message] = await Promise.all([
			diffFiles(git, before, after),
			authoredPaths(git, before, after),
			git.raw(["log", "-1", "--format=%B", after]),
		]);
		return {
			root: repo.root,
			before,
			after,
			files: authored ? files.filter((file) => authored.has(file.path)) : files,
			shared: message.includes(SHARED_TURN_TRAILER),
			live,
		};
	},
});

export const checkpointTasks = [
	checkpointCaptureTask,
	checkpointRefTask,
	checkpointChangesTask,
];
