import { useLingui } from "@lingui/react/macro";
import type { PromptInputCommand } from "@superset/chat-ui/PromptInput";
import { Download } from "lucide-react";
import { useCallback, useMemo } from "react";

export const EXPORT_COMMAND = "export";

export function useExportCommand(
	onExport: (() => void) | undefined,
	beforeRun: () => void,
): {
	command: PromptInputCommand | null;
	submit: (text: string) => boolean;
} {
	const { t } = useLingui();
	const run = useCallback(() => {
		if (!onExport) return;
		queueMicrotask(() => {
			beforeRun();
			onExport();
		});
	}, [onExport, beforeRun]);
	const command = useMemo<PromptInputCommand | null>(
		() =>
			onExport
				? {
						id: "superset:export",
						title: `/${EXPORT_COMMAND}`,
						description: t({ message: "Export this chat as a ZIP" }),
						icon: <Download className="size-4" />,
						group: t({ message: "Commands" }),
						onSelect: run,
					}
				: null,
		[onExport, run, t],
	);
	const submit = useCallback(
		(text: string) => {
			if (!onExport || text.trim() !== `/${EXPORT_COMMAND}`) return false;
			run();
			return true;
		},
		[onExport, run],
	);
	return { command, submit };
}
