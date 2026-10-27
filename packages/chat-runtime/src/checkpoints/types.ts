export type TurnCheckpointTarget = {
	cwd: string;
	sessionId: string;
	turnId: string;
};

export type TurnChangedFile = {
	/** Relative to the repository root. */
	path: string;
	status: "added" | "modified" | "deleted";
	/** Null for a binary file. */
	additions: number | null;
	deletions: number | null;
};

export type TurnChanges = {
	/** The repository root the paths are relative to. */
	root: string;
	before: string;
	after: string;
	files: TurnChangedFile[];
	/** Another chat in the same worktree ran a turn at the same time. */
	shared: boolean;
	/** `after` is a snapshot of a turn still running. */
	live: boolean;
};

/**
 * Snapshots of the worktree around each turn, kept as commits under hidden
 * refs, so what a turn changed is exact and includes edits made by shell
 * commands.
 */
export type ChatCheckpoints = {
	/** Snapshots the worktree before a prompt reaches the agent; null when it cannot. */
	capture(input: { cwd: string; sessionId: string }): Promise<string | null>;
	/** Names the snapshot taken before the prompt that started this turn. */
	turnStarted(input: TurnCheckpointTarget & { before: string }): Promise<void>;
	turnSettled(input: TurnCheckpointTarget): Promise<void>;
	/** Null when the turn has no snapshots. A running turn is compared with the worktree now. */
	changes(
		input: TurnCheckpointTarget & { live: boolean },
	): Promise<TurnChanges | null>;
};

/** One session's view of the checkpoints, bound to its worktree. */
export type SessionCheckpoints = {
	capture(): Promise<string | null>;
	turnStarted(turnId: string, before: string): void;
	turnSettled(turnId: string): void;
};
