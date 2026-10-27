import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TurnChangedFile } from "@superset/chat-runtime";
import { type SimpleGit, simpleGit } from "simple-git";
import { SHARED_TURN_TRAILER } from "../workers/tasks/checkpoints";
import { createGitCheckpoints } from "./gitCheckpoints";

describe("createGitCheckpoints", () => {
	let repo: string;
	let git: SimpleGit;
	const checkpoints = createGitCheckpoints((task, input) =>
		task.handler(input),
	);

	async function startTurn(sessionId: string, turnId: string) {
		const before = await checkpoints.capture({ cwd: repo, sessionId });
		if (!before) throw new Error("no snapshot");
		await checkpoints.turnStarted({ cwd: repo, sessionId, turnId, before });
	}

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-turn-checkpoints-"));
		git = simpleGit(repo);
		await git.init();
		await git.raw(["config", "user.email", "test@example.com"]);
		await git.raw(["config", "user.name", "test"]);
		await git.raw(["config", "commit.gpgsign", "false"]);
		await writeFile(join(repo, "tracked.txt"), "one\ntwo\n");
		await writeFile(join(repo, "gone.txt"), "old\n");
		await git.raw(["add", "-A"]);
		await git.raw(["commit", "-m", "init"]);
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("counts every file a turn changed, shell edits included, without touching the index", async () => {
		await writeFile(join(repo, "staged.txt"), "staged by the user\n");
		await git.raw(["add", "staged.txt"]);
		const head = await git.revparse(["HEAD"]);
		const staged = await git.raw(["diff", "--cached", "--name-only"]);

		await startTurn("s1", "t1");
		await writeFile(join(repo, "tracked.txt"), "one\n2\nthree\n");
		await writeFile(join(repo, "made-by-shell.txt"), "a\nb\n");
		await rm(join(repo, "gone.txt"));
		const live = await checkpoints.changes({
			cwd: repo,
			sessionId: "s1",
			turnId: "t1",
			live: true,
		});
		await checkpoints.turnSettled({ cwd: repo, sessionId: "s1", turnId: "t1" });
		const settled = await checkpoints.changes({
			cwd: repo,
			sessionId: "s1",
			turnId: "t1",
			live: false,
		});

		const expected: TurnChangedFile[] = [
			{ path: "gone.txt", status: "deleted", additions: 0, deletions: 1 },
			{
				path: "made-by-shell.txt",
				status: "added",
				additions: 2,
				deletions: 0,
			},
			{ path: "tracked.txt", status: "modified", additions: 2, deletions: 1 },
		];
		expect(live?.files).toEqual(expected);
		expect(live?.live).toBe(true);
		expect(settled?.files).toEqual(expected);
		expect(settled).toMatchObject({ live: false, shared: false });
		expect(await git.revparse(["HEAD"])).toBe(head);
		expect(await git.raw(["diff", "--cached", "--name-only"])).toBe(staged);
	});

	test("leaves out files that changed only because HEAD moved", async () => {
		await git.raw(["checkout", "-b", "upstream"]);
		await writeFile(join(repo, "pulled.txt"), "from upstream\n");
		await git.raw(["add", "pulled.txt"]);
		execFileSync("git", ["commit", "-m", "upstream work"], {
			cwd: repo,
			env: {
				...process.env,
				GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z",
				GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z",
			},
		});
		await git.raw(["checkout", "-"]);

		await startTurn("s1", "t1");
		await writeFile(join(repo, "mine.txt"), "agent\n");
		await git.raw(["merge", "--ff-only", "upstream"]);
		await checkpoints.turnSettled({ cwd: repo, sessionId: "s1", turnId: "t1" });

		const changes = await checkpoints.changes({
			cwd: repo,
			sessionId: "s1",
			turnId: "t1",
			live: false,
		});
		expect(changes?.files.map((file) => file.path)).toEqual(["mine.txt"]);
	});

	async function editedTurn() {
		await startTurn("s1", "t1");
		await writeFile(join(repo, "tracked.txt"), "agent\n");
		await writeFile(join(repo, "new.txt"), "agent\n");
		await rm(join(repo, "gone.txt"));
		await checkpoints.turnSettled({ cwd: repo, sessionId: "s1", turnId: "t1" });
	}
	const t1 = { sessionId: "s1", turnId: "t1" };
	const allPaths = ["gone.txt", "new.txt", "tracked.txt"];

	test("undoes a turn's files, leaving and listing any changed since", async () => {
		await editedTurn();
		await writeFile(join(repo, "new.txt"), "edited by the user\n");
		const staged = await git.raw(["diff", "--cached", "--name-only"]);

		const result = await checkpoints.undo({
			...t1,
			cwd: repo,
			paths: allPaths,
		});

		expect(result).toEqual({
			status: "undone",
			restored: ["gone.txt", "tracked.txt"],
			skipped: ["new.txt"],
		});
		expect(await readFile(join(repo, "tracked.txt"), "utf8")).toBe(
			"one\ntwo\n",
		);
		expect(await readFile(join(repo, "gone.txt"), "utf8")).toBe("old\n");
		expect(await readFile(join(repo, "new.txt"), "utf8")).toBe(
			"edited by the user\n",
		);
		expect(await git.raw(["diff", "--cached", "--name-only"])).toBe(staged);
		expect(
			(await checkpoints.changes({ ...t1, cwd: repo, live: false }))?.undone,
		).toBe(true);
	});

	test("once the turn's files are committed, lists them so and refuses to undo", async () => {
		await editedTurn();
		await git.raw(["add", "-A"]);
		await git.raw(["commit", "-m", "the turn's work"]);

		const changes = await checkpoints.changes({
			...t1,
			cwd: repo,
			live: false,
		});
		const undo = await checkpoints.undo({ ...t1, cwd: repo, paths: allPaths });

		expect(changes?.committed).toEqual(allPaths);
		expect(undo).toEqual({ status: "refused", reason: "head-moved" });
	});

	test("finds a settled turn again by its tool calls once the chat resumes under new ids", async () => {
		await startTurn("s1", "t1");
		await writeFile(join(repo, "tracked.txt"), "agent\n");
		await checkpoints.turnSettled({
			cwd: repo,
			sessionId: "s1",
			turnId: "t1",
			anchorItemId: "toolu_1",
		});
		const resumed = { cwd: repo, sessionId: "s2", turnId: "t9", live: false };

		const anchored = { ...resumed, anchorItemIds: ["toolu_0", "toolu_1"] };

		expect(await checkpoints.changes(resumed)).toBeNull();
		expect(
			(await checkpoints.changes(anchored))?.files.map((file) => file.path),
		).toEqual(["tracked.txt"]);
		await checkpoints.undo({
			cwd: repo,
			sessionId: "s1",
			turnId: "t1",
			paths: ["tracked.txt"],
			anchorItemIds: ["toolu_1"],
		});
		expect((await checkpoints.changes(anchored))?.undone).toBe(true);
	});

	test("marks turns that overlapped another chat's in the same worktree", async () => {
		const afterMessages = new Map<string, string>();
		const recording = createGitCheckpoints(async (_task, input) => {
			const { ref, message } = input as { ref?: string; message?: string };
			if (ref?.endsWith("/after") && message) afterMessages.set(ref, message);
			return null as never;
		});
		const turn = (sessionId: string, turnId: string) => ({
			cwd: "/repo",
			sessionId,
			turnId,
		});
		const shared = (sessionId: string, turnId: string) =>
			afterMessages
				.get(`refs/superset/chat-turns/${sessionId}/${turnId}/after`)
				?.includes(SHARED_TURN_TRAILER);

		await recording.turnStarted({ ...turn("s1", "t1"), before: "c1" });
		await recording.turnStarted({ ...turn("s2", "t2"), before: "c2" });
		await recording.turnSettled(turn("s2", "t2"));
		await recording.turnSettled(turn("s1", "t1"));
		await recording.turnStarted({ ...turn("s1", "t3"), before: "c3" });
		await recording.turnSettled(turn("s1", "t3"));

		expect([
			shared("s1", "t1"),
			shared("s2", "t2"),
			shared("s1", "t3"),
		]).toEqual([true, true, false]);
	});
});
