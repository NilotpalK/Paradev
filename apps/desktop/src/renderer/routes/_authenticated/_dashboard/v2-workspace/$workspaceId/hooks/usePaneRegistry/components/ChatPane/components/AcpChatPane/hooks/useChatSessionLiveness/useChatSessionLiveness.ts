import type { ChatTransport } from "@superset/chat/client";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { getHostEventBus } from "renderer/lib/host-event-bus";

export function useChatSessionLiveness({
	hostUrl,
	sessionId,
	transport,
}: {
	hostUrl: string;
	sessionId: string | null;
	transport: Pick<ChatTransport, "getSession">;
}) {
	const bus = useMemo(() => getHostEventBus(hostUrl), [hostUrl]);
	useEffect(() => bus.retain(), [bus]);
	const connection = useSyncExternalStore(
		useCallback((onChange) => bus.subscribeConnectionStatus(onChange), [bus]),
		() => bus.getConnectionStatus(),
	);
	const query = useQuery({
		enabled: sessionId !== null && connection.state === "open",
		queryKey: ["acp-chat-session", sessionId, hostUrl, connection],
		networkMode: "always",
		queryFn: () =>
			sessionId ? transport.getSession({ sessionId }) : Promise.resolve(null),
		staleTime: 5_000,
		refetchOnMount: "always",
		refetchInterval: (query) =>
			query.state.status === "error" ? 2_000 : false,
		refetchIntervalInBackground: true,
	});

	const checking =
		sessionId !== null && (connection.state !== "open" || !query.isSuccess);
	return { stored: checking ? undefined : query.data, checking };
}
