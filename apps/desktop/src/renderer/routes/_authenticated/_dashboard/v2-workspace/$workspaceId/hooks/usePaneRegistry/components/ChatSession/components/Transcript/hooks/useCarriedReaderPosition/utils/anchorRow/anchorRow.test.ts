import { expect, test } from "bun:test";
import type { TranscriptRow } from "../../../../utils/transcriptRows";
import { anchorRow } from "./anchorRow";

function userRow(key: string, text: string): TranscriptRow {
	return {
		kind: "item",
		key,
		groupStart: true,
		item: {
			id: `item-${key}`,
			kind: "user_message",
			startedAtMs: 1,
			content: [{ type: "text", text }],
		},
	};
}

function workingRow(key: string): TranscriptRow {
	return {
		kind: "working",
		key,
		groupStart: false,
		startedAtMs: 1,
		completedAtMs: 2,
		running: false,
	};
}

test("finds the message by text nearest the same place from the end", () => {
	const rows = [
		userRow("a", "fix it"),
		workingRow("w1"),
		userRow("b", "fix it"),
		userRow("c", "ship it"),
		userRow("d", "thanks"),
	];
	expect(
		anchorRow(rows, {
			userMessagesFromEnd: 1,
			messageText: "fix it",
			offsetPx: 0,
		})?.key,
	).toBe("b");
	expect(
		anchorRow(rows, {
			userMessagesFromEnd: 3,
			messageText: "fix it",
			offsetPx: 0,
		})?.key,
	).toBe("a");
});

test("falls back to the same place from the end when no text matches", () => {
	const rows = [userRow("a", "one"), userRow("b", "two")];
	const position = { messageText: "gone", offsetPx: 0 };
	expect(anchorRow(rows, { ...position, userMessagesFromEnd: 1 })?.key).toBe(
		"a",
	);
	expect(anchorRow(rows, { ...position, userMessagesFromEnd: 5 })).toBeNull();
});
