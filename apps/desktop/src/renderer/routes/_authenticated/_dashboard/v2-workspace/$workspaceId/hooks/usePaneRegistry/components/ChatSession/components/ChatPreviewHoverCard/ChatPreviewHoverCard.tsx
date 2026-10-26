import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useChatWiring } from "../../hooks/useSessionClient";
import {
	ChatPreviewCard,
	type ChatPreviewLoad,
} from "./components/ChatPreviewCard";
import { previewMessages } from "./utils/previewMessages";

const OPEN_DELAY_MS = 400;
const CLOSE_DELAY_MS = 100;
const PREVIEW_ITEMS = 60;
const FRESH_FOR_MS = 30_000;

/**
 * A card on hover or focus of a link to another chat: its title and the last
 * few messages, read from the host when the pointer arrives.
 */
export function ChatPreviewHoverCard({
	children,
	sessionId,
	workspaceId,
}: {
	children: ReactNode;
	sessionId: string;
	workspaceId: string;
}) {
	const { transport } = useChatWiring();
	const { hostUrl } = useWorkspaceClient();
	const [open, setOpen] = useState(false);
	const [wanted, setWanted] = useState(false);
	const query = useQuery({
		queryKey: ["chat-reference-preview", hostUrl, workspaceId, sessionId],
		queryFn: async () => {
			const { session } = await transport.getSession({ sessionId });
			if (!session || session.scopeId !== workspaceId) return null;
			const page = await transport.getItems({
				sessionId,
				limit: PREVIEW_ITEMS,
			});
			return {
				title: session.title?.trim() || null,
				messages: page.ok ? previewMessages(page.envelopes) : [],
			};
		},
		enabled: wanted || open,
		staleTime: FRESH_FOR_MS,
		retry: false,
	});
	const load: ChatPreviewLoad = query.data
		? { status: "ready", ...query.data }
		: query.isError || query.data === null
			? { status: "unavailable" }
			: { status: "loading" };
	return (
		<HoverCard
			closeDelay={CLOSE_DELAY_MS}
			onOpenChange={setOpen}
			open={open}
			openDelay={OPEN_DELAY_MS}
		>
			<HoverCardTrigger
				asChild
				onClick={() => setOpen(false)}
				onFocus={() => setWanted(true)}
				onPointerEnter={(event) => {
					if (event.pointerType !== "touch") setWanted(true);
				}}
			>
				{children}
			</HoverCardTrigger>
			<HoverCardContent
				align="start"
				className="w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border-foreground/[0.08] p-0 shadow-xl"
				side="top"
				sideOffset={6}
			>
				<ChatPreviewCard load={load} />
			</HoverCardContent>
		</HoverCard>
	);
}
