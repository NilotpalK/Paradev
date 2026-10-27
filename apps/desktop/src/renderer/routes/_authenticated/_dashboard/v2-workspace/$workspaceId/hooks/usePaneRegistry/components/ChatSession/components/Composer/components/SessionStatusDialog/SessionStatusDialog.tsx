import { Trans } from "@lingui/react/macro";
import type {
	SessionConfigOption,
	SessionUsage,
} from "@superset/chat/protocol";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useAccountUsage } from "../../../../../../hooks/useAccountUsage";
import { configOptionLabels } from "../../utils/configOptionLabels";
import type { SessionMode } from "../ModePicker";
import {
	SessionStatusContent,
	type WorkspaceKind,
} from "./components/SessionStatusContent";

export type SessionStatusDetails = {
	workspaceId: string;
	terminalId: string;
	agentLabel?: string;
	configOptions: SessionConfigOption[];
	modes?: SessionMode[];
	currentModeId?: string;
	usage: SessionUsage | null;
};

export function SessionStatusDialog({
	details,
	onOpenChange,
}: {
	details: SessionStatusDetails;
	onOpenChange: (open: boolean) => void;
}) {
	const { workspaceId, terminalId } = details;
	const host = useWorkspaceHostTarget(workspaceId);
	const { workspaces } = useHostWorkspaces();
	const row = workspaces.find((workspace) => workspace.id === workspaceId);
	const { account, now, state, status } = useAccountUsage(
		workspaceId,
		terminalId,
	);
	const workspace: WorkspaceKind | undefined =
		host.status === "ready" && host.kind === "sandbox"
			? "cloud"
			: row?.type === "worktree"
				? "worktree"
				: row
					? "local"
					: undefined;
	const { model, effort, fast } = configOptionLabels(details.configOptions);
	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md" aria-describedby={undefined}>
				<DialogHeader>
					<DialogTitle>
						<Trans>Session status</Trans>
					</DialogTitle>
				</DialogHeader>
				<SessionStatusContent
					agent={details.agentLabel}
					model={model}
					effort={effort}
					fast={fast}
					mode={
						details.modes?.find((mode) => mode.id === details.currentModeId)
							?.label
					}
					workspace={workspace}
					branch={row?.branch ?? undefined}
					usage={details.usage}
					limits={{
						now,
						status,
						windows:
							state === "ready" || state === "stale"
								? (account?.windows ?? [])
								: [],
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
