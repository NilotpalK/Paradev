import type { ChatPullRequestLink } from "../terminal-agents/types";

const PULL_REQUEST_URL =
	/https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/g;
export const MAX_CHAT_PULL_REQUESTS = 50;

export function findPullRequestLinks(text: string): ChatPullRequestLink[] {
	const found = new Map<string, ChatPullRequestLink>();
	for (const [, owner = "", repo = "", number = ""] of text.matchAll(
		PULL_REQUEST_URL,
	)) {
		const url = `https://github.com/${owner}/${repo}/pull/${number}`;
		if (!found.has(url))
			found.set(url, { url, owner, repo, number: Number(number) });
	}
	return [...found.values()];
}

export function mergePullRequestLinks(
	known: readonly ChatPullRequestLink[] | undefined,
	found: readonly ChatPullRequestLink[],
): ChatPullRequestLink[] | null {
	const urls = new Set(known?.map((link) => link.url));
	const added = found.filter((link) => !urls.has(link.url));
	if (added.length === 0) return null;
	return [...(known ?? []), ...added].slice(-MAX_CHAT_PULL_REQUESTS);
}
