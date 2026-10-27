import type { ChatCheckpoints, TurnAnchors } from "@superset/chat-runtime";
import type { WorkerTaskDefinition } from "../workers/define-worker-task";
import { getHostWorkerPool } from "../workers/host-worker-pool";
import {
	checkpointAnchorTask,
	checkpointCaptureTask,
	checkpointChangesTask,
	checkpointRefTask,
	checkpointUndoTask,
	SHARED_TURN_TRAILER,
	turnRef,
} from "../workers/tasks/checkpoints";

/** A prompt waits on this; a tree too large to snapshot quickly goes without. */
const CAPTURE_TIMEOUT_MS = 5_000;
/** A snapshot whose prompt never started a turn, as when it was cancelled, stops counting. */
const UNSTARTED_SPAN_MS = 60_000;

type RunTask = <TInput, TResult>(
	task: WorkerTaskDefinition<TInput, TResult>,
	input: TInput,
) => Promise<TResult>;

const runInWorker: RunTask = (task, input) =>
	getHostWorkerPool().run(task, input);

/** From the snapshot before a prompt to the turn's end; `end` is null while it runs. */
type Span = { sessionId: string; start: number; end: number | null };

function turnKey(sessionId: string, turnId: string): string {
	return `${sessionId}/${turnId}`;
}

function unstartedKey(sessionId: string): string {
	return `unstarted:${sessionId}`;
}

function anchorsInput({ harnessSessionId, anchorItemIds }: TurnAnchors) {
	return harnessSessionId && anchorItemIds
		? { harnessSessionId, anchorItemIds }
		: {};
}

/**
 * Git snapshots run in the host worker pool, off the event loop. Which chats
 * work in a worktree at once is known only here: a turn whose span, from the
 * snapshot before its prompt to its end, overlaps another chat's is marked
 * shared. A snapshot waits for an Undo in the same worktree to finish.
 */
export function createGitCheckpoints(
	run: RunTask = runInWorker,
	now: () => number = Date.now,
): ChatCheckpoints {
	const spansByCwd = new Map<string, Map<string, Span>>();
	const settling = new Map<string, Promise<unknown>>();
	const undoing = new Map<string, Promise<unknown>>();

	const spansIn = (cwd: string): Map<string, Span> => {
		let spans = spansByCwd.get(cwd);
		if (!spans) {
			spans = new Map();
			spansByCwd.set(cwd, spans);
		}
		return spans;
	};

	const isStale = (key: string, span: Span, at: number) =>
		key.startsWith("unstarted:") && at - span.start > UNSTARTED_SPAN_MS;

	const overlapsOther = (cwd: string, own: Span, at: number): boolean => {
		const ownEnd = own.end ?? at;
		for (const [key, span] of spansIn(cwd)) {
			if (span.sessionId === own.sessionId || isStale(key, span, at)) continue;
			if (span.start <= ownEnd && (span.end ?? at) >= own.start) return true;
		}
		return false;
	};

	const prune = (cwd: string, at: number) => {
		const spans = spansIn(cwd);
		for (const [key, span] of spans) {
			if (isStale(key, span, at)) spans.delete(key);
		}
		const openStarts = [...spans.values()]
			.filter((span) => span.end === null)
			.map((span) => span.start);
		const earliestOpen = Math.min(Number.POSITIVE_INFINITY, ...openStarts);
		for (const [key, span] of spans) {
			if (span.end !== null && span.end < earliestOpen) spans.delete(key);
		}
		if (spans.size === 0) spansByCwd.delete(cwd);
	};

	return {
		capture: async ({ cwd, sessionId }) => {
			await undoing.get(cwd)?.catch(() => undefined);
			const key = unstartedKey(sessionId);
			spansIn(cwd).set(key, { sessionId, start: now(), end: null });
			const before = await run(checkpointCaptureTask, {
				cwd,
				message: "superset chat turn before",
				timeoutMs: CAPTURE_TIMEOUT_MS,
			}).catch((error: unknown) => {
				spansIn(cwd).delete(key);
				throw error;
			});
			if (!before) spansIn(cwd).delete(key);
			return before;
		},

		turnStarted: async ({ cwd, sessionId, turnId, before }) => {
			const spans = spansIn(cwd);
			const unstarted = spans.get(unstartedKey(sessionId));
			spans.delete(unstartedKey(sessionId));
			spans.set(turnKey(sessionId, turnId), {
				sessionId,
				start: unstarted?.start ?? now(),
				end: null,
			});
			await run(checkpointRefTask, {
				cwd,
				ref: turnRef(sessionId, turnId, "before"),
				commit: before,
			});
		},

		turnSettled: async ({ cwd, sessionId, turnId, anchor }) => {
			const key = turnKey(sessionId, turnId);
			const at = now();
			const span = spansIn(cwd).get(key) ?? { sessionId, start: at, end: null };
			span.end = at;
			spansIn(cwd).set(key, span);
			const wasShared = overlapsOther(cwd, span, at);
			prune(cwd, at);
			const snapshot = run(checkpointCaptureTask, {
				cwd,
				ref: turnRef(sessionId, turnId, "after"),
				dropRefs: [turnRef(sessionId, turnId, "live")],
				message: wasShared
					? `superset chat turn after\n\n${SHARED_TURN_TRAILER}`
					: "superset chat turn after",
			}).then(() =>
				anchor
					? run(checkpointAnchorTask, {
							cwd,
							sessionId,
							turnId,
							harnessSessionId: anchor.harnessSessionId,
							anchorItemId: anchor.itemId,
						})
					: undefined,
			);
			settling.set(key, snapshot);
			try {
				await snapshot;
			} finally {
				if (settling.get(key) === snapshot) settling.delete(key);
			}
		},

		changes: async ({ cwd, sessionId, turnId, live, ...anchors }) => {
			const key = turnKey(sessionId, turnId);
			await settling.get(key)?.catch(() => undefined);
			const changes = await run(checkpointChangesTask, {
				cwd,
				sessionId,
				turnId,
				live,
				...anchorsInput(anchors),
			});
			const span = spansByCwd.get(cwd)?.get(key);
			if (!changes || !live || !span) return changes;
			return {
				...changes,
				shared: changes.shared || overlapsOther(cwd, span, now()),
			};
		},

		undo: async ({ cwd, sessionId, turnId, paths, ...anchors }) => {
			const undo = run(checkpointUndoTask, {
				cwd,
				sessionId,
				turnId,
				paths,
				...anchorsInput(anchors),
			});
			undoing.set(cwd, undo);
			try {
				return await undo;
			} finally {
				if (undoing.get(cwd) === undo) undoing.delete(cwd);
			}
		},
	};
}
