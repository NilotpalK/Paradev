import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { MessageSquare, SquareTerminal } from "lucide-react";
import { useState } from "react";
import type { SurfaceForkSource } from "../../hooks/useSurfaceFork";
import {
	type AgentPane,
	useSurfaceForkSource,
} from "./hooks/useSurfaceForkSource";

export function SurfaceForkButton({
	pane,
	onFork,
	workspaceId,
}: {
	workspaceId: string;
	pane: AgentPane;
	onFork: (source: SurfaceForkSource) => Promise<void>;
}) {
	const { t } = useLingui();
	const source = useSurfaceForkSource(workspaceId, pane);
	const [forking, setForking] = useState(false);

	if (!source) return null;

	const label =
		source.into === "chat"
			? t({ message: "Fork into chat" })
			: t({ message: "Fork into CLI" });
	const Icon = source.into === "chat" ? MessageSquare : SquareTerminal;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					aria-label={label}
					className="hidden rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground disabled:opacity-50 @min-[200px]/pane-header:block"
					disabled={forking}
					onClick={() => {
						setForking(true);
						void onFork(source).finally(() => setForking(false));
					}}
					type="button"
				>
					<Icon className="size-3.5" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}
