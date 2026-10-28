export type ChatPullRequestLink = {
	url: string;
	owner: string;
	repo: string;
	number: number;
};

export type ChatPullRequest = ChatPullRequestLink & {
	key: string;
	terminalId: string;
};

export const pullRequestKey = (pullRequest: {
	owner?: string;
	repoOwner?: string;
	repo?: string;
	repoName?: string;
	number: number;
}) =>
	`${pullRequest.owner ?? pullRequest.repoOwner}/${pullRequest.repo ?? pullRequest.repoName}#${pullRequest.number}`.toLowerCase();

export function collectChatPullRequests(
	bindings: Iterable<{
		terminalId: string;
		endedAt?: number | null;
		pullRequests?: readonly ChatPullRequestLink[];
	}>,
	known: ReadonlySet<string>,
): ChatPullRequest[] {
	const found = new Map<string, ChatPullRequest>();
	for (const binding of bindings) {
		if (binding.endedAt) continue;
		for (const link of binding.pullRequests ?? []) {
			const key = pullRequestKey(link);
			if (known.has(key)) continue;
			found.delete(key);
			found.set(key, { ...link, key, terminalId: binding.terminalId });
		}
	}
	return [...found.values()].reverse();
}
