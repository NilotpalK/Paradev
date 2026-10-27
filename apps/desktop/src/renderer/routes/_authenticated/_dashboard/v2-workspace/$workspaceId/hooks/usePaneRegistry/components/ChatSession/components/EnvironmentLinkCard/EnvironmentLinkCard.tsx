import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { memo, useRef } from "react";
import { LuContainer } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { RefreshEnvironmentOnAgentTurn } from "renderer/routes/_authenticated/components/RefreshEnvironmentOnAgentTurn";
import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";

/**
 * The card for one environment link, or nothing: an environment the reader
 * cannot see, a failed lookup, and a lookup in flight all leave the link as it
 * was. It refreshes when the workspace's agent finishes a turn, since that is
 * when setup changes what the environment holds.
 */
export const EnvironmentLinkCard = memo(function EnvironmentLinkCard({
	className,
	environmentId,
	url,
}: {
	environmentId: string;
	url: string;
	className?: string;
}) {
	const { openAppLink, workspaceId } = useChatPaneActions();
	const enabled = openAppLink !== undefined;
	const environment = cloudTrpc.environment.get.useQuery(
		{ id: environmentId },
		{ enabled, retry: false },
	);
	const secrets = cloudTrpc.environment.secrets.list.useQuery(
		{ environmentId },
		{ enabled, retry: false },
	);
	const knownAtMount = useRef(environment.data !== undefined);

	const row = environment.data;
	if (!openAppLink || !row) return null;
	const variableCount = secrets.data?.length ?? 0;

	return (
		<button
			className={cn(
				"flex h-[68px] w-full max-w-md shrink-0 overflow-hidden rounded-lg border border-border bg-card text-left font-sans transition-colors hover:border-muted-foreground/30",
				!knownAtMount.current &&
					"animate-block-fade motion-reduce:animate-none",
				className,
			)}
			data-find-skip
			onClick={(event) => openAppLink(url, event)}
			type="button"
		>
			{workspaceId && (
				<RefreshEnvironmentOnAgentTurn
					environmentId={environmentId}
					workspaceId={workspaceId}
				/>
			)}
			<span className="flex h-full w-[68px] shrink-0 items-center justify-center border-border/60 border-r bg-muted/40">
				<LuContainer className="size-5 text-muted-foreground" />
			</span>
			<span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3">
				<span className="flex min-w-0 items-center gap-1.5">
					<span className="truncate font-medium text-foreground text-sm leading-5">
						{row.name}
					</span>
					{row.scope === "personal" && (
						<span className="shrink-0 rounded-sm bg-foreground/[0.06] px-1 text-[10px] text-muted-foreground">
							<Trans>Only you</Trans>
						</span>
					)}
				</span>
				<span className="truncate text-muted-foreground text-xs leading-4">
					{row.repositories
						.map((repository) => repository.fullName)
						.join(" · ")}
				</span>
				<span className="truncate text-[11px] text-muted-foreground/80 leading-4">
					{row.sourceKind === "fork" ? (
						<Trans>{variableCount} variables · checkpoint saved</Trans>
					) : (
						<Trans>{variableCount} variables · base image</Trans>
					)}
				</span>
			</span>
		</button>
	);
});
