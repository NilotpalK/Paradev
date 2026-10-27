import { acpHarnessForPreset } from "@superset/chat/core";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import type { ChatPaneData, TerminalPaneData } from "../../../../../../types";
import type { SurfaceForkSource } from "../../../../hooks/useSurfaceFork";

export type AgentPane =
	| { kind: "terminal"; data: TerminalPaneData }
	| { kind: "chat"; data: ChatPaneData };

export function useSurfaceForkSource(
	workspaceId: string,
	pane: AgentPane,
): SurfaceForkSource | null {
	const enabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.AGENT_SURFACE_FORK) === true;
	const binding = useTerminalAgentBinding(workspaceId, pane.data.terminalId);
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	if (!enabled) return null;

	if (pane.kind === "chat") {
		const { agent } = pane.data;
		if (!agent?.sessionId) return null;
		const config = configs.find(
			(entry) => entry.presetId === agent.id && entry.forkArgs?.length,
		);
		return config
			? { into: "cli", configId: config.id, harnessSessionId: agent.sessionId }
			: null;
	}

	if (
		!binding?.agentSessionId ||
		binding.endedAt ||
		!acpHarnessForPreset(binding.agentId)
	) {
		return null;
	}
	return {
		into: "chat",
		presetId: binding.agentId,
		harnessSessionId: binding.agentSessionId,
	};
}
