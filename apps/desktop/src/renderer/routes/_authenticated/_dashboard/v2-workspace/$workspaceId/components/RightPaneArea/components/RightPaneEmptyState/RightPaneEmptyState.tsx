import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { LuGitPullRequestArrow } from "react-icons/lu";
import type { OpenPullRequestPane } from "renderer/lib/github/openPullRequestLink";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { usePRFlowState } from "../../../../hooks/usePRFlowState";
import { getRightPaneOptions, type RightPaneGates } from "../../paneOptions";
import type { RightPaneKind } from "../../types";

interface RightPaneEmptyStateProps {
	onAdd: (kind: RightPaneKind) => void;
	onOpenPullRequest: OpenPullRequestPane;
	gates: RightPaneGates;
}

export function RightPaneEmptyState({
	onAdd,
	onOpenPullRequest,
	gates,
}: RightPaneEmptyStateProps) {
	const { i18n, t } = useLingui();
	const { workspace } = useWorkspace();
	const { flowState } = usePRFlowState(workspace.id, {
		enabled: workspace.type !== "session",
	});
	const pr = "pr" in flowState ? flowState.pr : null;
	const pullRequestRef = pr ? pullRequestRefFromUrl(pr.url) : null;

	return (
		<div className="flex flex-col items-center gap-3 p-4">
			<p className="text-sm text-muted-foreground">
				<Trans>Open a pane, or drag one here from the center.</Trans>
			</p>
			<div className="grid grid-cols-2 gap-2">
				{pullRequestRef && (
					<Button
						variant="outline"
						size="sm"
						className="col-span-2 justify-start"
						onClick={() => onOpenPullRequest(pullRequestRef, "tab")}
					>
						<LuGitPullRequestArrow className="size-4" />
						{t({ message: `Pull request #${pullRequestRef.number}` })}
					</Button>
				)}
				{getRightPaneOptions(gates).map((option) => (
					<Button
						key={option.kind}
						variant="outline"
						size="sm"
						className="justify-start"
						onClick={() => onAdd(option.kind)}
					>
						<option.Icon className="size-4" />
						{i18n._(option.label)}
					</Button>
				))}
			</div>
		</div>
	);
}
