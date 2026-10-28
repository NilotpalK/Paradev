import { describe, expect, test } from "bun:test";
import {
	findPullRequestLinks,
	MAX_CHAT_PULL_REQUESTS,
	mergePullRequestLinks,
} from "./pullRequestLinks";

describe("findPullRequestLinks", () => {
	test("finds each pull request URL once, from any repo", () => {
		const text = [
			"Creating pull request for feat/x into main in acme/web",
			"https://github.com/acme/web/pull/42",
			'{"url":"https://github.com/acme/api.v2/pull/7#discussion_r1"}',
			"see https://github.com/acme/web/pull/42 again",
			"https://github.com/acme/web/issues/9 and https://example.com/pull/3",
		].join("\n");
		expect(findPullRequestLinks(text)).toEqual([
			{
				url: "https://github.com/acme/web/pull/42",
				owner: "acme",
				repo: "web",
				number: 42,
			},
			{
				url: "https://github.com/acme/api.v2/pull/7",
				owner: "acme",
				repo: "api.v2",
				number: 7,
			},
		]);
	});
});

describe("mergePullRequestLinks", () => {
	const link = (n: number) => ({
		url: `https://github.com/acme/web/pull/${n}`,
		owner: "acme",
		repo: "web",
		number: n,
	});

	test("returns null when nothing is new, so callers skip the broadcast", () => {
		expect(mergePullRequestLinks([link(1)], [link(1)])).toBeNull();
	});

	test("appends new links and keeps the most recent", () => {
		const known = Array.from({ length: MAX_CHAT_PULL_REQUESTS }, (_, n) =>
			link(n),
		);
		const merged = mergePullRequestLinks(known, [link(999)]);
		expect(merged).toHaveLength(MAX_CHAT_PULL_REQUESTS);
		expect(merged?.at(-1)).toEqual(link(999));
		expect(merged?.[0]).toEqual(link(1));
	});
});
