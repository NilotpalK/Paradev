import { Trans } from "@lingui/react/macro";
import type { ChannelBroadcast } from "@superset/shared/channels";

interface MentionBroadcastRowProps {
	broadcast: ChannelBroadcast;
}

/** @here, @channel or @everyone in the @ menu, with Slack's description. */
export function MentionBroadcastRow({ broadcast }: MentionBroadcastRowProps) {
	return (
		<div className="flex min-w-0 flex-1 items-center gap-2.5">
			<span className="shrink-0 font-semibold">@{broadcast}</span>
			<span className="min-w-0 truncate text-xs text-muted-foreground">
				{broadcast === "here" ? (
					<Trans>Notify every online member in this channel</Trans>
				) : (
					<Trans>Notify everyone in this channel</Trans>
				)}
			</span>
		</div>
	);
}
