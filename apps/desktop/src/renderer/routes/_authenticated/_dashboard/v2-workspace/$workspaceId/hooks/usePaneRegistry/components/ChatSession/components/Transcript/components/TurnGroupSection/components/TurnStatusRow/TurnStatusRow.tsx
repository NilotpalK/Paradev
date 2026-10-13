import { Trans } from "@lingui/react/macro";
import type { TurnError } from "@superset/chat/protocol";
import { TurnFailureCard } from "./components/TurnFailureCard";

/**
 * How a turn ended when it did not finish: a quiet word for an interruption
 * the reader caused, a card for a failure, with the agent's own words under
 * a title that says what kind of failure it was.
 */
export function TurnStatusRow({
	error,
	latest,
	status,
	turnId,
}: {
	status: "failed" | "interrupted";
	error: TurnError | undefined;
	latest: boolean;
	turnId: string;
}) {
	if (status === "interrupted") {
		return (
			<div className="text-muted-foreground text-xs">
				<Trans>Stopped</Trans>
			</div>
		);
	}
	return <TurnFailureCard error={error} latest={latest} turnId={turnId} />;
}
