import { describe, expect, test } from "bun:test";
import { chatReferenceUrl, parseSupersetAppLink } from "./supersetAppLink";

const WEB = "https://app.superset.sh";

describe("parseSupersetAppLink", () => {
	test.each([
		["https://app.superset.sh/page/my-page", { kind: "page", slug: "my-page" }],
		[
			"https://app.superset.sh/tasks/SUP-12/",
			{ kind: "task", taskId: "SUP-12" },
		],
		[
			"https://app.superset.sh/automations/a1",
			{ kind: "automation", automationId: "a1" },
		],
		[
			"https://app.superset.sh/plugins/linear",
			{ kind: "plugin", pluginName: "linear" },
		],
		[
			"https://app.superset.sh/workspaces/w1?tab=chat",
			{ kind: "workspace", workspaceId: "w1" },
		],
	])("%s", (href, expected) => {
		expect(parseSupersetAppLink(href, WEB)).toEqual(expected as never);
	});

	test("ignores other origins and unknown paths", () => {
		expect(parseSupersetAppLink("https://evil.sh/tasks/SUP-12", WEB)).toBe(
			null,
		);
		expect(parseSupersetAppLink("https://app.superset.sh/settings", WEB)).toBe(
			null,
		);
		expect(parseSupersetAppLink("https://app.superset.sh/tasks/a/b", WEB)).toBe(
			null,
		);
	});

	test("a workspace link with a session is a chat reference, and round-trips", () => {
		const url = chatReferenceUrl("ws 1", "session-9", WEB);
		expect(url).toBe(
			"https://app.superset.sh/workspaces/ws%201?sessionId=session-9",
		);
		expect(parseSupersetAppLink(url, WEB)).toEqual({
			kind: "chat",
			workspaceId: "ws 1",
			sessionId: "session-9",
		});
	});
});
