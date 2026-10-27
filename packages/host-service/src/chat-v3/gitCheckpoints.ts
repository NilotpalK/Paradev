import type { ChatCheckpoints } from "@superset/chat-runtime";
import type { WorkerTaskDefinition } from "../workers/define-worker-task";
import { getHostWorkerPool } from "../workers/host-worker-pool";
import {
	checkpointCaptureTask,
	checkpointChangesTask,
	checkpointRefTask,
	SHARED_TURN_TRAILER,
	turnRef,
} from "../workers/tasks/checkpoints";

/** A prompt waits on this; a tree too large to snapshot quickly goes without. */
const CAPTURE_TIMEOUT_MS = 5_000;

type RunTask = <TInput, TResult>(
	task: WorkerTaskDefinition<TInput, TResult>,
	input: TInput,
) => Promise<TResult>;

const runInWorker: RunTask = (task, input) =>
	getHostWorkerPool().run(task, input);

function turnKey(sessionId: string, turnId: string): string {
	return `${sessionId}/${turnId}`;
}

/**
 * Git snapshots run in the host worker pool, off the event loop. Which turns
 * run at once in a worktree is known only here, so a turn that overlapped
 * another chat's is marked shared when it settles.
 */
export function createGitCheckpoints(
	run: RunTask = runInWorker,
): ChatCheckpoints {
	const runningByCwd = new Map<string, Set<string>>();
	const shared = new Set<string>();
	const settling = new Map<string, Promise<unknown>>();

	return {
		capture: ({ cwd }) =>
			run(checkpointCaptureTask, {
				cwd,
				message: "superset chat turn before",
				timeoutMs: CAPTURE_TIMEOUT_MS,
			}),

		turnStarted: async ({ cwd, sessionId, turnId, before }) => {
			const key = turnKey(sessionId, turnId);
			const running = runningByCwd.get(cwd) ?? new Set<string>();
			if (running.size > 0) {
				shared.add(key);
				for (const other of running) shared.add(other);
			}
			running.add(key);
			runningByCwd.set(cwd, running);
			await run(checkpointRefTask, {
				cwd,
				ref: turnRef(sessionId, turnId, "before"),
				commit: before,
			});
		},

		turnSettled: async ({ cwd, sessionId, turnId }) => {
			const key = turnKey(sessionId, turnId);
			const running = runningByCwd.get(cwd);
			running?.delete(key);
			if (running?.size === 0) runningByCwd.delete(cwd);
			const wasShared = shared.delete(key);
			const snapshot = run(checkpointCaptureTask, {
				cwd,
				ref: turnRef(sessionId, turnId, "after"),
				dropRefs: [turnRef(sessionId, turnId, "live")],
				message: wasShared
					? `superset chat turn after\n\n${SHARED_TURN_TRAILER}`
					: "superset chat turn after",
			});
			settling.set(key, snapshot);
			try {
				await snapshot;
			} finally {
				if (settling.get(key) === snapshot) settling.delete(key);
			}
		},

		changes: async ({ cwd, sessionId, turnId, live }) => {
			const key = turnKey(sessionId, turnId);
			await settling.get(key)?.catch(() => undefined);
			const changes = await run(checkpointChangesTask, {
				cwd,
				sessionId,
				turnId,
				live,
			});
			if (!changes || !live) return changes;
			return { ...changes, shared: changes.shared || shared.has(key) };
		},
	};
}
