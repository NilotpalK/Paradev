import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { emptySnapshot, reduceMany } from "@superset/chat/core";
import type { UsageLimitAction, UserMessage } from "@superset/chat/protocol";
import type { FakeHarnessScript } from "../../harness/fake";
import type { ChatRuntime } from "../../index";
import { agentMessage, turn } from "../../testing/fixtures";
import { createTestRuntime } from "../../testing/testRuntime";
import {
	FAKE_HARNESS,
	fakeHarnessRegistry,
	journalEnvelopes,
	waitFor,
} from "../../testing/testUtils";

const REFUSED: FakeHarnessScript["turns"][number] = [
	{ kind: "turn", turn: turn("t1") },
	{
		kind: "turn",
		turn: turn("t1", {
			status: "failed",
			error: { message: "error_during_execution" },
			completedAtMs: 2,
		}),
	},
	{ kind: "session", session: { usageLimit: { hitAtMs: 2, resetsAtMs: 50 } } },
	{ kind: "session", session: { status: "idle" } },
];

const COMPLETED: FakeHarnessScript["turns"][number] = [
	{ kind: "turn", turn: turn("t2") },
	{ kind: "item", item: agentMessage("a2", "done"), turnId: "t2" },
	{ kind: "turn", turn: turn("t2", { status: "completed", completedAtMs: 4 }) },
	{ kind: "session", session: { status: "idle" } },
];

function startSession(
	script: FakeHarnessScript,
	usageLimitGraceMs = 30_000,
): { runtime: ChatRuntime; sessionId: string } {
	const { harnesses } = fakeHarnessRegistry(script);
	const runtime = createTestRuntime({ harnesses, usageLimitGraceMs });
	const { sessionId } = runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId: "workspace-1",
		harness: FAKE_HARNESS,
		cwd: "/tmp/workspace",
	});
	return { runtime, sessionId };
}

function sendPrompt(runtime: ChatRuntime, sessionId: string, text: string) {
	return runtime.commands.prompt({
		commandId: randomUUID(),
		sessionId,
		clientId: `client-${text}`,
		content: [{ type: "text", text }],
	});
}

function respond(
	runtime: ChatRuntime,
	sessionId: string,
	action: UsageLimitAction,
) {
	runtime.commands.respondToUsageLimit({
		commandId: randomUUID(),
		sessionId,
		action,
	});
}

function snapshot(runtime: ChatRuntime, sessionId: string) {
	return reduceMany(emptySnapshot(), journalEnvelopes(runtime, sessionId));
}

function deliveredTexts(runtime: ChatRuntime, sessionId: string): string[] {
	const seen = new Map<string, UserMessage>();
	for (const envelope of journalEnvelopes(runtime, sessionId)) {
		const event = envelope.event;
		if (event.type === "item" && event.item.kind === "user_message") {
			seen.set(event.item.id, event.item as UserMessage);
		}
	}
	return [...seen.values()]
		.filter((item) => !item.queued && !item.discarded)
		.map((item) =>
			item.content.map((c) => (c.type === "text" ? c.text : "")).join(""),
		);
}

describe("LiveSession usage limit", () => {
	test("a refused turn records the limit and holds later prompts in a paused queue", async () => {
		const { runtime, sessionId } = startSession({
			turns: [REFUSED, COMPLETED],
		});
		sendPrompt(runtime, sessionId, "first");
		await waitFor(
			() => snapshot(runtime, sessionId).session?.usageLimit !== undefined,
		);
		expect(snapshot(runtime, sessionId).session?.usageLimit).toEqual({
			hitAtMs: 2,
			resetsAtMs: 50,
		});

		const second = sendPrompt(runtime, sessionId, "second");
		expect(second.queued).toBe(true);
		expect(snapshot(runtime, sessionId).session?.queuePaused).toBe(true);
		expect(deliveredTexts(runtime, sessionId)).toEqual(["first"]);

		respond(runtime, sessionId, "resume");
		await waitFor(
			() =>
				snapshot(runtime, sessionId).turns.get("t2")?.status === "completed",
		);
		const session = snapshot(runtime, sessionId).session;
		expect(session?.usageLimit).toBeUndefined();
		expect(session?.queuePaused).toBe(false);
		expect(deliveredTexts(runtime, sessionId)).toEqual(["first", "second"]);
		await runtime.dispose();
	});

	test("resuming with nothing queued continues the cut-short work", async () => {
		const { runtime, sessionId } = startSession({
			turns: [REFUSED, COMPLETED],
		});
		sendPrompt(runtime, sessionId, "first");
		await waitFor(
			() => snapshot(runtime, sessionId).session?.usageLimit !== undefined,
		);
		respond(runtime, sessionId, "resume");
		await waitFor(
			() =>
				snapshot(runtime, sessionId).turns.get("t2")?.status === "completed",
		);
		expect(deliveredTexts(runtime, sessionId)).toEqual(["first", "Continue"]);
		await runtime.dispose();
	});

	test("dismissing drops the notice and leaves the queue paused", async () => {
		const { runtime, sessionId } = startSession({
			turns: [REFUSED, COMPLETED],
		});
		sendPrompt(runtime, sessionId, "first");
		await waitFor(
			() => snapshot(runtime, sessionId).session?.usageLimit !== undefined,
		);
		sendPrompt(runtime, sessionId, "second");
		respond(runtime, sessionId, "dismiss");
		const session = snapshot(runtime, sessionId).session;
		expect(session?.usageLimit).toBeUndefined();
		expect(session?.queuePaused).toBe(true);
		expect(deliveredTexts(runtime, sessionId)).toEqual(["first"]);
		await runtime.dispose();
	});

	test("resume at reset continues on its own once the window reopens, and can be cancelled", async () => {
		const { runtime, sessionId } = startSession(
			{ turns: [REFUSED, COMPLETED] },
			0,
		);
		sendPrompt(runtime, sessionId, "first");
		await waitFor(
			() => snapshot(runtime, sessionId).session?.usageLimit !== undefined,
		);
		respond(runtime, sessionId, "resume_at_reset");
		expect(
			snapshot(runtime, sessionId).session?.usageLimit?.resumeAtReset,
		).toBe(true);
		respond(runtime, sessionId, "cancel_resume_at_reset");
		expect(
			snapshot(runtime, sessionId).session?.usageLimit?.resumeAtReset,
		).toBe(false);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(deliveredTexts(runtime, sessionId)).toEqual(["first"]);

		respond(runtime, sessionId, "resume_at_reset");
		await waitFor(
			() =>
				snapshot(runtime, sessionId).turns.get("t2")?.status === "completed",
		);
		expect(deliveredTexts(runtime, sessionId)).toEqual(["first", "Continue"]);
		expect(snapshot(runtime, sessionId).session?.usageLimit).toBeUndefined();
		await runtime.dispose();
	});

	test("a failed turn whose error names the limit counts, with no reset time", async () => {
		const { runtime, sessionId } = startSession({
			turns: [
				[
					{ kind: "turn", turn: turn("t1") },
					{
						kind: "turn",
						turn: turn("t1", {
							status: "failed",
							error: { message: "You've hit your usage limit." },
							completedAtMs: 2,
						}),
					},
					{ kind: "session", session: { status: "idle" } },
				],
			],
		});
		sendPrompt(runtime, sessionId, "first");
		await waitFor(
			() => snapshot(runtime, sessionId).session?.usageLimit !== undefined,
		);
		expect(
			snapshot(runtime, sessionId).session?.usageLimit?.resetsAtMs,
		).toBeUndefined();
		await runtime.dispose();
	});
});
