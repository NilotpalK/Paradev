import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo } from "react";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import type { PRState } from "renderer/screens/main/components/PRIcon";
import type { PullRequestEntry } from "../../components/PullRequestRow";
import {
	type ChatPullRequest,
	collectChatPullRequests,
} from "../../utils/collectChatPullRequests";

const STALE_MS = 60_000;
const CHECKS = new Set(["success", "failure", "pending", "none"]);

const toState = (state: string | undefined): PRState =>
	state === "merged" || state === "closed" || state === "queued"
		? state
		: "open";

export type ChatPullRequestEntry = PullRequestEntry & { terminalId: string };

export function useChatPullRequests(
	workspaceId: string,
	{ enabled, known }: { enabled: boolean; known: ReadonlySet<string> },
): ChatPullRequestEntry[] {
	const bindings = useTerminalAgentBindings(workspaceId);
	const links: ChatPullRequest[] = useMemo(
		() => collectChatPullRequests(bindings.values(), known),
		[bindings, known],
	);
	const details = workspaceTrpc.useQueries((t) =>
		links.map((link) =>
			t.pullRequests.getContentByRepo(
				{ repoFullName: `${link.owner}/${link.repo}`, prNumber: link.number },
				{ enabled, staleTime: STALE_MS, retry: false },
			),
		),
	);
	return links.map((link, index) => {
		const data = details[index]?.data;
		const checksStatus =
			data && CHECKS.has(data.checksStatus) ? data.checksStatus : "none";
		return {
			repoOwner: link.owner,
			repoName: link.repo,
			number: link.number,
			url: data?.url ?? link.url,
			title: data?.title ?? "",
			state: toState(data?.state),
			isDraft: data?.isDraft ?? false,
			headBranch: data?.branch ?? "",
			checksStatus: checksStatus as PullRequestEntry["checksStatus"],
			terminalId: link.terminalId,
		};
	});
}
