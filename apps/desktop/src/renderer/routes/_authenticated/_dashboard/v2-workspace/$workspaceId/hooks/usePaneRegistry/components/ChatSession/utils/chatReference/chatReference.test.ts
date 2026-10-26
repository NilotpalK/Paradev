import { expect, test } from "bun:test";
import { chatContextLine, chatReferenceChip } from "./chatReference";

const options = { webUrl: "https://app.superset.sh", isDark: true };

test("a chat chip sends the chat's link", () => {
	const chip = chatReferenceChip(
		{ workspaceId: "ws1", sessionId: "s9", title: "Fix login" },
		options,
	);
	expect(chip.serialized).toBe(
		"https://app.superset.sh/workspaces/ws1?sessionId=s9",
	);
	expect(chip.label).toBe("Fix login");
	const long = chatReferenceChip(
		{
			workspaceId: "ws1",
			sessionId: "s9",
			title: `Do this\n${"x".repeat(80)}`,
		},
		options,
	);
	expect(long.label).toHaveLength(48);
	expect(long.label.endsWith("…")).toBe(true);
});

test("the context line tells the agent how to read each referenced chat once", () => {
	const chip = chatReferenceChip(
		{ workspaceId: "ws1", sessionId: "s9", title: "Fix login" },
		options,
	);
	const other = {
		label: "acme/widgets#4",
		serialized: "https://github.com/acme/widgets/pull/4",
		data: { link: "https://github.com/acme/widgets/pull/4" },
	};
	const line = chatContextLine([chip, other, chip], options.webUrl);
	expect(line).toContain("untrusted context");
	expect(line?.match(/superset sessions read/g)).toHaveLength(1);
	expect(line).toContain(
		'- "Fix login": `superset sessions read --workspace ws1 --session s9`',
	);
	expect(chatContextLine([other], options.webUrl)).toBeNull();
});
