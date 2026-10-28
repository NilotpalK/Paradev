import { expect, test } from "bun:test";
import {
	collectChatPullRequests,
	pullRequestKey,
} from "./collectChatPullRequests";

const link = (repo: string, number: number) => ({
	url: `https://github.com/acme/${repo}/pull/${number}`,
	owner: "acme",
	repo,
	number,
});

test("chat pull requests are merged across chats, newest first, minus known ones", () => {
	const known = new Set([
		pullRequestKey({ repoOwner: "ACME", repoName: "web", number: 1 }),
	]);
	const result = collectChatPullRequests(
		[
			{ terminalId: "chat-a", pullRequests: [link("web", 1), link("api", 7)] },
			{ terminalId: "chat-b", pullRequests: [link("docs", 3), link("api", 7)] },
			{ terminalId: "chat-gone", endedAt: 5, pullRequests: [link("old", 9)] },
		],
		known,
	);
	expect(
		result.map(({ repo, number, terminalId }) => [repo, number, terminalId]),
	).toEqual([
		["api", 7, "chat-b"],
		["docs", 3, "chat-b"],
	]);
});
