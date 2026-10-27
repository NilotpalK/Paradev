import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { HiOutlineCog6Tooth } from "react-icons/hi2";
import { LuContainer } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";

/** Marks a chat as an environment's setup session, with a way to open the environment. */
export function SetupSessionHeader({
	environmentId,
	url,
}: {
	environmentId: string;
	url: string;
}) {
	const { openAppLink } = useChatPaneActions();
	const environment = cloudTrpc.environment.get.useQuery(
		{ id: environmentId },
		{ retry: false },
	);
	return (
		<div className="flex items-center gap-2 border-b border-border/60 px-6 py-1.5 text-xs text-muted-foreground">
			<LuContainer className="size-3.5 shrink-0" />
			<span className="text-foreground">
				<Trans>Cloud environment setup</Trans>
			</span>
			{environment.data && (
				<>
					<span aria-hidden="true" className="text-border">
						·
					</span>
					<span className="truncate">{environment.data.name}</span>
				</>
			)}
			{openAppLink && (
				<Button
					className="ml-auto h-6 text-muted-foreground"
					onClick={(event) => openAppLink(url, event)}
					size="xs"
					variant="ghost"
				>
					<HiOutlineCog6Tooth className="size-3.5" />
					<Trans>Edit environment</Trans>
				</Button>
			)}
		</div>
	);
}
