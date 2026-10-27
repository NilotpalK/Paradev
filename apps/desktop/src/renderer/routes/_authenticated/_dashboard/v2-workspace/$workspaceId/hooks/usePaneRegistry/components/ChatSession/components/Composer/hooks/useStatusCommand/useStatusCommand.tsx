import { useLingui } from "@lingui/react/macro";
import type { PromptInputCommand } from "@superset/chat-ui/PromptInput";
import { Info } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import {
	type SessionStatusDetails,
	SessionStatusDialog,
} from "../../components/SessionStatusDialog";

type StatusCommandControls = {
	command: PromptInputCommand | null;
	dialog: ReactNode;
	open: () => void;
};

export function useStatusCommand(
	details: SessionStatusDetails | undefined,
	beforeOpen: () => void,
): StatusCommandControls {
	const { t } = useLingui();
	const [isOpen, setIsOpen] = useState(false);
	const available = details !== undefined;
	const open = useCallback(() => {
		queueMicrotask(() => {
			beforeOpen();
			setIsOpen(true);
		});
	}, [beforeOpen]);
	const command = useMemo<PromptInputCommand | null>(
		() =>
			available
				? {
						id: "superset:status",
						title: "/status",
						description: t({ message: "Session status" }),
						icon: <Info className="size-4" />,
						group: t({ message: "Commands" }),
						onSelect: open,
					}
				: null,
		[available, open, t],
	);
	return {
		command,
		dialog:
			details && isOpen ? (
				<SessionStatusDialog details={details} onOpenChange={setIsOpen} />
			) : null,
		open,
	};
}
