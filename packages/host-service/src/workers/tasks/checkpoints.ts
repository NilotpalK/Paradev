import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type {
	TurnChangedFile,
	TurnChanges,
	TurnUndoResult,
} from "@superset/chat-runtime";
import type { SimpleGit } from "simple-git";
import { createUserSimpleGit } from "../../runtime/git/simple-git.ts";
import { defineWorkerTask } from "../define-worker-task.ts";

const GIT_TIMEOUT_MS = 15_000;
const PATH_BATCH = 200;
const REGULAR_FILE_MODES = new Set(["100644", "100755"]);
const CHECKPOINT_IDENTITY = {
	GIT_AUTHOR_NAME: "Superset",
	GIT_AUTHOR_EMAIL: "checkpoints@superset.sh",
	GIT_COMMITTER_NAME: "Superset",
	GIT_COMMITTER_EMAIL: "checkpoints@superset.sh",
};
export const SHARED_TURN_TRAILER = "Superset-Shared-Turn: true";

export type TurnSnapshot = "before" | "after" | "live" | "undone";

function refSegment(id: string): string {
	return id.replace(/[^A-Za-z0-9._-]/g, "_");
}

function turnBase(sessionId: string, turnId: string): string {
	return `refs/superset/chat-turns/${refSegment(sessionId)}/${refSegment(turnId)}`;
}

/** Where a settled turn is also kept: under its first tool call, whose id survives a resume. */
function anchorBase(anchorItemId: string): string {
	return `refs/superset/chat-turns/by-call/${refSegment(anchorItemId)}`;
}

export function turnRef(
	sessionId: string,
	turnId: string,
	snapshot: TurnSnapshot,
): string {
	return `${turnBase(sessionId, turnId)}/${snapshot}`;
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

type SnapshotHeads = {
	capturedAt: string;
	/** HEAD when each snapshot was taken; empty on an unborn branch. */
	beforeHead: string;
	afterHead: string;
};

async function snapshotHeads(
	git: SimpleGit,
	before: string,
	after: string,
): Promise<SnapshotHeads> {
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
	return { capturedAt, beforeHead, afterHead };
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
	{ capturedAt, beforeHead, afterHead }: SnapshotHeads,
): Promise<Set<string> | null> {
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

/** Files whose turn result HEAD holds now, with nothing left to commit. */
async function committedPaths(
	git: SimpleGit,
	after: string,
	afterHead: string,
	paths: readonly string[],
): Promise<string[]> {
	const head = await readRef(git, "HEAD");
	if (!head || head === afterHead) return [];
	const [differFromResult, uncommitted] = await Promise.all([
		changedNames(git, ["diff", after, head]),
		changedNames(git, ["diff", "HEAD"]),
	]);
	const open = new Set([...differFromResult, ...uncommitted]);
	return paths.filter((path) => !open.has(path));
}

function batches<T>(items: readonly T[]): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += PATH_BATCH) {
		out.push(items.slice(i, i + PATH_BATCH));
	}
	return out;
}

type Entry = { mode: string; oid: string };

/** `<mode> <type> <oid>\t<path>` from ls-tree, `<mode> <oid> <stage>\t<path>` from ls-files. */
function entries(output: string, oidField: 1 | 2): Map<string, Entry> {
	const map = new Map<string, Entry>();
	for (const record of nulFields(output)) {
		const tab = record.indexOf("\t");
		const fields = record.slice(0, tab).split(" ");
		map.set(record.slice(tab + 1), {
			mode: fields[0] ?? "",
			oid: fields[oidField] ?? "",
		});
	}
	return map;
}

async function treeEntries(
	git: SimpleGit,
	commit: string,
	paths: readonly string[],
): Promise<Map<string, Entry>> {
	const map = new Map<string, Entry>();
	for (const batch of batches(paths)) {
		const output = await git.raw([
			"ls-tree",
			"-r",
			"-z",
			"--full-tree",
			commit,
			"--",
			...batch,
		]);
		for (const [path, entry] of entries(output, 2)) map.set(path, entry);
	}
	return map;
}

/** What the worktree holds for `paths` now, hashed the way `git add` would. */
async function worktreeEntries(
	repo: Repo,
	paths: readonly string[],
): Promise<Map<string, Entry>> {
	return withScratchIndex(repo, async (git) => {
		await git.raw(["add", "-A"]);
		const map = new Map<string, Entry>();
		for (const batch of batches(paths)) {
			const output = await git.raw(["ls-files", "-s", "-z", "--", ...batch]);
			for (const [path, entry] of entries(output, 1)) map.set(path, entry);
		}
		return map;
	});
}

/** The refs of a settled turn: its own, or those of a tool call it shares with a resumed chat. */
async function settledBase(
	git: SimpleGit,
	sessionId: string,
	turnId: string,
	anchorItemIds: readonly string[] = [],
): Promise<string | null> {
	const own = turnBase(sessionId, turnId);
	if (await readRef(git, `${own}/before`)) return own;
	if (anchorItemIds.length === 0) return null;
	const found = (
		await git.raw([
			"for-each-ref",
			"--count=1",
			"--format=%(refname)",
			...anchorItemIds.map((id) => `${anchorBase(id)}/before`),
		])
	).trim();
	return found ? found.slice(0, -"/before".length) : null;
}

/** Marks a turn undone under its own refs and under each alias of the same snapshot. */
async function markUndone(
	git: SimpleGit,
	base: string,
	before: string,
	anchorItemIds: readonly string[] = [],
): Promise<void> {
	const aliases =
		anchorItemIds.length === 0
			? ""
			: await git.raw([
					"for-each-ref",
					"--format=%(refname) %(objectname)",
					...anchorItemIds.map((id) => `${anchorBase(id)}/before`),
				]);
	const bases = new Set([base]);
	for (const line of aliases.split("\n")) {
		const [ref = "", commit = ""] = line.split(" ");
		if (commit === before) bases.add(ref.slice(0, -"/before".length));
	}
	for (const each of bases) {
		await git.raw(["update-ref", `${each}/undone`, before]);
	}
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

export const checkpointAnchorTask = defineWorkerTask<
	{ cwd: string; sessionId: string; turnId: string; anchorItemId: string },
	void
>({
	type: "checkpoints/anchor",
	handler: async ({ cwd, sessionId, turnId, anchorItemId }) => {
		const git = gitAt(cwd);
		for (const snapshot of ["before", "after"] as const) {
			const commit = await readRef(git, turnRef(sessionId, turnId, snapshot));
			if (commit) {
				await git.raw([
					"update-ref",
					`${anchorBase(anchorItemId)}/${snapshot}`,
					commit,
				]);
			}
		}
	},
});

export const checkpointChangesTask = defineWorkerTask<
	{
		cwd: string;
		sessionId: string;
		turnId: string;
		live: boolean;
		anchorItemIds?: string[];
	},
	TurnChanges | null
>({
	type: "checkpoints/changes",
	handler: async ({ cwd, sessionId, turnId, live, anchorItemIds }) => {
		const repo = await repoAt(cwd);
		if (!repo) return null;
		const git = gitAt(repo.root);
		const base = live
			? turnBase(sessionId, turnId)
			: await settledBase(git, sessionId, turnId, anchorItemIds);
		if (!base) return null;
		const before = await readRef(git, `${base}/before`);
		if (!before) return null;
		let after: string | null;
		if (live) {
			after = await withScratchIndex(repo, (scratch) =>
				snapshotCommit(scratch, `superset chat turn ${turnId} live`),
			);
			await git.raw(["update-ref", `${base}/live`, after]);
		} else {
			after = await readRef(git, `${base}/after`);
		}
		if (!after) return null;
		const heads = await snapshotHeads(git, before, after);
		const [diffed, authored, message, undone] = await Promise.all([
			diffFiles(git, before, after),
			authoredPaths(git, before, after, heads),
			git.raw(["log", "-1", "--format=%B", after]),
			readRef(git, `${base}/undone`),
		]);
		const files = authored
			? diffed.filter((file) => authored.has(file.path))
			: diffed;
		return {
			root: repo.root,
			before,
			after,
			files,
			shared: message.includes(SHARED_TURN_TRAILER),
			live,
			undone: undone !== null,
			committed: live
				? []
				: await committedPaths(
						git,
						after,
						heads.afterHead,
						files.map((file) => file.path),
					),
		};
	},
});

/**
 * Puts files back as they were before the turn, but only those that still
 * hold exactly what the turn left. Anything changed since, by anyone, stays
 * as it is and is listed. The user's index, HEAD and branch are untouched.
 */
export const checkpointUndoTask = defineWorkerTask<
	{
		cwd: string;
		sessionId: string;
		turnId: string;
		paths: string[];
		anchorItemIds?: string[];
	},
	TurnUndoResult
>({
	type: "checkpoints/undo",
	handler: async ({ cwd, sessionId, turnId, paths, anchorItemIds }) => {
		const repo = await repoAt(cwd);
		if (!repo) return { status: "refused", reason: "missing" };
		const git = gitAt(repo.root);
		const base = await settledBase(git, sessionId, turnId, anchorItemIds);
		if (!base) return { status: "refused", reason: "missing" };
		const [before, after, head] = await Promise.all([
			readRef(git, `${base}/before`),
			readRef(git, `${base}/after`),
			readRef(git, "HEAD"),
		]);
		if (!before || !after) return { status: "refused", reason: "missing" };
		const { beforeHead, afterHead } = await snapshotHeads(git, before, after);
		if (beforeHead !== afterHead || (head ?? "") !== afterHead) {
			return { status: "refused", reason: "head-moved" };
		}
		const requested = new Set(paths);
		const changed = (await diffFiles(git, before, after))
			.map((file) => file.path)
			.filter((path) => requested.has(path));
		const [original, result, now] = await Promise.all([
			treeEntries(git, before, changed),
			treeEntries(git, after, changed),
			worktreeEntries(repo, changed),
		]);
		const unchangedSince = (path: string) => {
			const was = original.get(path);
			const left = result.get(path);
			const current = now.get(path);
			if (was && !REGULAR_FILE_MODES.has(was.mode)) return false;
			if (!left) return !current;
			return (
				REGULAR_FILE_MODES.has(left.mode) &&
				current?.mode === left.mode &&
				current.oid === left.oid
			);
		};
		const restored = changed.filter(unchangedSince);
		const skipped = changed.filter((path) => !unchangedSince(path));
		const recreate = restored.filter((path) => original.has(path));
		if (recreate.length > 0) {
			await withScratchIndex(repo, async (scratch) => {
				await scratch.raw(["read-tree", `${before}^{tree}`]);
				for (const batch of batches(recreate)) {
					await scratch.raw(["checkout-index", "-f", "--", ...batch]);
				}
			});
		}
		await Promise.all(
			restored
				.filter((path) => !original.has(path))
				.map((path) => rm(join(repo.root, path), { force: true })),
		);
		await markUndone(git, base, before, anchorItemIds);
		return { status: "undone", restored, skipped };
	},
});

export const checkpointTasks = [
	checkpointCaptureTask,
	checkpointRefTask,
	checkpointAnchorTask,
	checkpointChangesTask,
	checkpointUndoTask,
];
