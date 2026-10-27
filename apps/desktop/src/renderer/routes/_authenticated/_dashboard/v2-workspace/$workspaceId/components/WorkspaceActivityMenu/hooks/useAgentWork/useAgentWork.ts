import { useEffect, useMemo, useRef } from "react";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import {
	useActivityPanelStore,
	useFinishedSubagents,
} from "../../stores/activityPanelStore";
import {
	type AgentBinding,
	type AgentWork,
	collectAgentWork,
} from "../../utils/collectAgentWork";

const sameSession = (
	binding: AgentBinding | undefined,
	item: Pick<AgentWork, "sessionId">,
) =>
	binding !== undefined &&
	!binding.endedAt &&
	(binding.chatSessionId ?? undefined) === item.sessionId;

export function useAgentWork(workspaceId: string) {
	const bindings = useTerminalAgentBindings(workspaceId);
	const work = useMemo(() => collectAgentWork(bindings.values()), [bindings]);
	const recordFinished = useActivityPanelStore((state) => state.recordFinished);
	const recorded = useFinishedSubagents(workspaceId);
	const previous = useRef<readonly AgentWork[]>([]);

	useEffect(() => {
		const live = new Set(work.subagents.map((item) => item.key));
		const finished = previous.current
			.filter(
				(item) =>
					!live.has(item.key) &&
					sameSession(bindings.get(item.terminalId), item),
			)
			.map((item) => ({
				key: item.key,
				name: item.name,
				terminalId: item.terminalId,
				taskId: item.taskId,
				...(item.sessionId ? { sessionId: item.sessionId } : {}),
			}));
		previous.current = work.subagents;
		recordFinished(workspaceId, finished);
	}, [work, bindings, workspaceId, recordFinished]);

	const finished = useMemo(() => {
		const live = new Set(work.subagents.map((item) => item.key));
		return recorded.filter(
			(entry) =>
				!live.has(entry.key) &&
				sameSession(bindings.get(entry.terminalId), entry),
		);
	}, [recorded, work, bindings]);

	return { ...work, finished };
}
