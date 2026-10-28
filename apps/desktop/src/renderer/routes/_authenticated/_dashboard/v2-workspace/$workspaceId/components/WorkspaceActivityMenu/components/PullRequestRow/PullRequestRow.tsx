import type { MouseEvent } from "react";
import { PRIcon, type PRState } from "renderer/screens/main/components/PRIcon";
import { PRStatusIndicators } from "../../../PRStatusIndicators";
import {
	pullRequestDisplayState,
	showsChecks,
} from "../../utils/pullRequestDisplayState";

export type PullRequestEntry = {
	repoOwner: string;
	repoName: string;
	number: number;
	url: string;
	title: string;
	state: PRState;
	isDraft: boolean;
	headBranch: string;
	checksStatus: "success" | "failure" | "pending" | "none";
};

export function PullRequestRow({
	pullRequest,
	onOpen,
}: {
	pullRequest: PullRequestEntry;
	onOpen: (pullRequest: PullRequestEntry, event: MouseEvent) => void;
}) {
	const state = pullRequestDisplayState(pullRequest);
	return (
		<button
			type="button"
			onClick={(event) => onOpen(pullRequest, event)}
			className="flex min-h-7 w-full items-center gap-2 rounded-sm py-0.5 pr-2 pl-2 text-left text-xs outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
		>
			<PRIcon state={state} className="size-3.5 shrink-0" />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="flex min-w-0 items-center gap-1.5">
					<span className="shrink-0 text-muted-foreground tabular-nums">
						#{pullRequest.number}
					</span>
					<span className="min-w-0 truncate text-foreground">
						{pullRequest.title}
					</span>
				</span>
				<span className="min-w-0 truncate text-[11px] text-muted-foreground/70">
					{pullRequest.repoOwner}/{pullRequest.repoName} ·{" "}
					{pullRequest.headBranch}
				</span>
			</span>
			{showsChecks(state) && (
				<PRStatusIndicators checks={{ overall: pullRequest.checksStatus }} />
			)}
		</button>
	);
}
