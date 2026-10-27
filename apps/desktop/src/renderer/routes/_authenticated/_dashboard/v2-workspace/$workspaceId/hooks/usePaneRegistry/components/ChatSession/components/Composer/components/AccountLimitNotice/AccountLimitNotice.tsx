import { useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import { Gauge, X } from "lucide-react";
import { useState } from "react";
import { formatResetLabel } from "renderer/utils/usage/formatResetIn";
import { useAccountUsage } from "../../../../../../hooks/useAccountUsage";

const APPROACHING_LIMIT_PERCENT = 80;

export function AccountLimitNotice({
	className,
	terminalId,
	workspaceId,
}: {
	className?: string;
	terminalId: string;
	workspaceId: string;
}) {
	const { t } = useLingui();
	const { now, state, tightest } = useAccountUsage(workspaceId, terminalId);
	const [dismissedKey, setDismissedKey] = useState<string | null>(null);
	if (
		state !== "ready" ||
		!tightest ||
		tightest.usedPercent < APPROACHING_LIMIT_PERCENT
	)
		return null;
	const key = `${tightest.id}:${tightest.resetsAt}`;
	if (dismissedKey === key) return null;
	const windowLabel = tightest.label;
	const percent = formatPercent(tightest.usedPercent / 100, {
		maximumFractionDigits: 0,
	});
	const resetsAt = tightest.resetsAt ? new Date(tightest.resetsAt) : null;
	const reset =
		resetsAt && resetsAt.getTime() > now.getTime()
			? formatResetLabel(resetsAt, now)
			: null;
	const text = t({ message: `${windowLabel} limit ${percent} used` });
	return (
		<div
			data-testid="account-limit-notice"
			className={cn(
				"mb-1.5 flex items-center gap-2 px-3 text-muted-foreground text-xs",
				className,
			)}
		>
			<Gauge aria-hidden className="size-3.5 shrink-0 text-warning" />
			<span className="min-w-0 flex-1 truncate tabular-nums">
				{reset ? `${text} · ${reset}` : text}
			</span>
			<button
				type="button"
				aria-label={t({ message: "Dismiss" })}
				onClick={() => setDismissedKey(key)}
				className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-foreground/[0.07] hover:text-foreground"
			>
				<X className="size-3" />
			</button>
		</div>
	);
}
