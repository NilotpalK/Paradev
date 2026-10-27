import { useLingui } from "@lingui/react/macro";
import type { PromptInputCommand } from "@superset/chat-ui/PromptInput";
import { Pencil } from "lucide-react";
import { useCallback, useMemo } from "react";
import { commandChip } from "../../../../utils/commandChip";

export const RENAME_COMMAND = "rename";
const RENAME_TEXT = /^\/rename(?:\s+([\s\S]*))?$/;

export function useRenameCommand(
	onRename: ((title: string | null) => void) | undefined,
): {
	command: PromptInputCommand | null;
	submit: (text: string) => boolean;
} {
	const { t } = useLingui();
	const command = useMemo<PromptInputCommand | null>(() => {
		if (!onRename) return null;
		const description = t({
			message: "Rename this chat, or regenerate its title",
		});
		return {
			id: "superset:rename",
			title: `/${RENAME_COMMAND}`,
			hint: t({ message: "[title]" }),
			description,
			icon: <Pencil className="size-4" />,
			group: t({ message: "Commands" }),
			onSelect: (ctx) =>
				ctx.insertChip(commandChip(RENAME_COMMAND, description)),
		};
	}, [onRename, t]);
	const submit = useCallback(
		(text: string) => {
			const match = onRename ? RENAME_TEXT.exec(text.trim()) : null;
			if (!match || !onRename) return false;
			onRename(match[1]?.trim() || null);
			return true;
		},
		[onRename],
	);
	return { command, submit };
}
