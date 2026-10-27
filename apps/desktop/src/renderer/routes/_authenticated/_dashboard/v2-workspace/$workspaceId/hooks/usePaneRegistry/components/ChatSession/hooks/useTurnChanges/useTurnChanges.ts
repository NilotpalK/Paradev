import type { TurnChanges } from "@superset/chat-runtime";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";

const LIVE_REFRESH_MS = 3_000;

/**
 * What a turn changed, from its worktree snapshots: undefined while loading,
 * null when the turn has none or the host predates them. A live read
 * snapshots the worktree again whenever `refreshKey` changes, at most every
 * few seconds.
 */
export function useTurnChanges(
	turnId: string | null,
	{
		live = false,
		refreshKey = 0,
	}: { live?: boolean; refreshKey?: number } = {},
): TurnChanges | null | undefined {
	const { turnChanges } = useChatPaneActions();
	const lastLoadAt = useRef(0);
	const query = useQuery({
		queryKey: ["chat-turn-changes", turnChanges?.sessionId, turnId, live],
		queryFn: async () => {
			lastLoadAt.current = Date.now();
			if (!turnChanges || !turnId) return null;
			const changes = await turnChanges.load(turnId, live);
			return changes === "unsupported" ? null : changes;
		},
		enabled: Boolean(turnChanges && turnId),
		staleTime: live ? 0 : Number.POSITIVE_INFINITY,
		retry: false,
	});
	const { refetch } = query;

	useEffect(() => {
		if (!live || refreshKey === 0) return;
		const wait = Math.max(0, lastLoadAt.current + LIVE_REFRESH_MS - Date.now());
		const timer = setTimeout(() => void refetch(), wait);
		return () => clearTimeout(timer);
	}, [live, refreshKey, refetch]);

	if (query.isError) return null;
	return query.data;
}
