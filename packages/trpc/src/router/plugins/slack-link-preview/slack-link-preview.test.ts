import { describe, expect, test } from "bun:test";
import type { PluginTarget } from "../proxy";
import { loadSlackLinkPreview } from "./slack-link-preview";

const READY = {
	kind: "first-party",
	plugin: "slack",
	version: "1.2.3",
	connectionId: "c1",
} as unknown as PluginTarget;
const MESSAGE =
	"https://acme.slack.com/archives/C0123ABC/p1788794757390949?thread_ts=1788794700.000100";
const request = (href: string) => ({
	href,
	userId: "u1",
	organizationId: "o1",
});
const text = (value: string) => ({ content: [{ type: "text", text: value }] });

function deps(
	answers: Record<string, string>,
	target: PluginTarget = READY,
	calls: string[] = [],
) {
	return {
		calls,
		deps: {
			resolveTarget: async () => target,
			callTool: async (_: PluginTarget, tool: string) => {
				calls.push(tool);
				const answer = answers[tool];
				if (answer === undefined) throw new Error("no answer");
				return text(answer);
			},
		},
	};
}

describe("loadSlackLinkPreview", () => {
	test("finds the linked reply in its thread and names its author", async () => {
		const { deps: d } = deps({
			get_thread_replies: [
				"Thread in <#C0123ABC> — 2 message(s):",
				"",
				"[1788794700.000100] <@U1>: Deploy is red 💬 1 reply",
				"[1788794757.390949] <@U2>: Fixed in <https://github.com/acme/w/pull/42|#42> &amp; redeployed ↪️ in thread",
			].join("\n"),
			get_user: "User: <@U2> - Grace Hopper\nID: U2\nHandle: grace\n",
		});
		expect(await loadSlackLinkPreview(d, request(MESSAGE))).toEqual({
			status: "ready",
			title: "Grace Hopper",
			description: "Fixed in #42 & redeployed",
		});
	});

	test("a profile link shows the person's name and title", async () => {
		const { deps: d } = deps({
			get_user: "User: <@U2> - Grace Hopper\nID: U2\nTitle: Rear Admiral\n",
		});
		expect(
			await loadSlackLinkPreview(d, request("https://acme.slack.com/team/U2")),
		).toEqual({
			status: "ready",
			title: "Grace Hopper",
			description: "Rear Admiral",
		});
	});

	test("without one ready Slack connection there is no preview and no call", async () => {
		const { deps: d, calls } = deps({}, {
			kind: "needs-auth",
			connector: "slack",
			connectUrl: "x",
		} as unknown as PluginTarget);
		expect(await loadSlackLinkPreview(d, request(MESSAGE))).toEqual({
			status: "unavailable",
		});
		expect(calls).toEqual([]);
	});

	test("a link that is not a Slack message or profile is never looked up", async () => {
		const { deps: d, calls } = deps({});
		expect(
			await loadSlackLinkPreview(
				d,
				request("https://example.com/archives/C1/p1"),
			),
		).toEqual({ status: "unavailable" });
		expect(calls).toEqual([]);
	});
});
