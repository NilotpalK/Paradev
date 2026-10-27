import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/**
 * Refetches an environment when the workspace's agent finishes a turn, since
 * that is when setup changes what it holds. Mounted only where there is a
 * workspace to listen to.
 */
export function RefreshEnvironmentOnAgentTurn({
	environmentId,
	workspaceId,
}: {
	environmentId: string;
	workspaceId: string;
}) {
	const utils = cloudTrpc.useUtils();
	useWorkspaceEvent("agent:lifecycle", workspaceId, (payload) => {
		if (payload.eventType !== "Stop") return;
		void utils.environment.get.invalidate({ id: environmentId });
		void utils.environment.secrets.list.invalidate({ environmentId });
	});
	return null;
}
