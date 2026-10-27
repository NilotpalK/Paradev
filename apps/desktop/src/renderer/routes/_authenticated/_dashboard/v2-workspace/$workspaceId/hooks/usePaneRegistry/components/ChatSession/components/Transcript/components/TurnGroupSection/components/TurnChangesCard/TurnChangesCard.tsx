import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { ChevronDown, FileDiff } from "lucide-react";
import { useMemo, useState } from "react";
import { DiffStatText } from "../../../../../../../../../../components/DiffStatText";
import { useChatPaneActions } from "../../../../../../providers/ChatPaneActionsProvider";
import type { TurnFileChange } from "../../../../utils/turnChangedFiles";
import { ChangedFileRow } from "./components/ChangedFileRow";
import { FOLDED_FILE_COUNT, MAX_UNFOLDED_FILES } from "./constants";
import { filePlace, reviewFilter } from "./utils/filePlace";

/**
 * What a settled turn changed, under its answer: a one-line count and total,
 * Review for the turn's files in the diff pane, and a row per file.
 */
export function TurnChangesCard({
	files,
}: {
	files: readonly TurnFileChange[];
}) {
	const { t } = useLingui();
	const { openDiff, openFile, workspaceId } = useChatPaneActions();
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: Boolean(workspaceId) },
	);
	const worktreePath = workspaceQuery.data?.worktreePath;
	const [expanded, setExpanded] = useState(false);

	const places = useMemo(
		() => files.map((file) => filePlace(file.path, worktreePath)),
		[files, worktreePath],
	);
	const filter = useMemo(() => reviewFilter(places), [places]);
	const totals = files.reduce(
		(sum, file) => ({
			additions: sum.additions + (file.stats?.additions ?? 0),
			deletions: sum.deletions + (file.stats?.deletions ?? 0),
		}),
		{ additions: 0, deletions: 0 },
	);
	const longestCount = Math.max(
		0,
		...files.flatMap((file) =>
			file.stats ? [file.stats.additions, file.stats.deletions] : [],
		),
	);
	const statWidth = `${String(longestCount).length + 2}ch`;

	const fileCount = files.length;
	const folded = fileCount > MAX_UNFOLDED_FILES && !expanded;
	const shown = folded ? files.slice(0, FOLDED_FILE_COUNT) : files;
	const hiddenCount = fileCount - FOLDED_FILE_COUNT;
	const review =
		filter && openDiff ? (path?: string) => openDiff(filter, path) : undefined;

	return (
		<div className="mt-1 mb-2 overflow-hidden rounded-lg border border-border/60 text-[13px]">
			<div className="flex min-w-0 items-center gap-2 border-border/50 border-b bg-foreground/[0.03] py-1 pr-1.5 pl-3">
				<FileDiff className="size-3.5 shrink-0 text-muted-foreground" />
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="min-w-0 truncate text-foreground/90">
							{plural(fileCount, {
								one: "Edited # file",
								other: "Edited # files",
							})}
						</span>
					</TooltipTrigger>
					<TooltipContent className="max-w-72">
						<Trans>
							Counted from the agent's file edits. Changes made by shell
							commands, notebook or MCP tools, or subagents are not included,
							and a file edited more than once can count a line twice.
						</Trans>
					</TooltipContent>
				</Tooltip>
				<span
					className="min-w-0 shrink-[100] truncate whitespace-nowrap font-mono text-xs tabular-nums"
					data-find-skip
				>
					<DiffStatText
						additions={totals.additions}
						deletions={totals.deletions}
					/>
				</span>
				<span className="flex-1" />
				{review && (
					<Button
						className="h-6 shrink-0 px-2 text-xs"
						onClick={() => review()}
						size="xs"
						variant="outline"
					>
						<Trans>Review</Trans>
					</Button>
				)}
			</div>
			{shown.map((file, index) => {
				const place = places[index];
				if (!place) return null;
				const { relativePath } = place;
				return (
					<ChangedFileRow
						key={file.path}
						kind={file.kind}
						onOpen={
							openFile
								? () =>
										openFile(
											place.absolutePath,
											false,
											file.line ? { line: file.line } : undefined,
										)
								: undefined
						}
						onReview={
							review && relativePath ? () => review(relativePath) : undefined
						}
						place={place}
						stats={file.stats}
						statWidth={statWidth}
					/>
				);
			})}
			{fileCount > MAX_UNFOLDED_FILES && (
				<button
					aria-expanded={expanded}
					className="flex w-full items-center gap-1.5 border-border/50 border-t px-3 py-1 text-left text-muted-foreground text-xs transition-colors hover:text-foreground"
					onClick={() => setExpanded((value) => !value)}
					type="button"
				>
					<ChevronDown
						className={cn(
							"size-3 transition-transform",
							expanded && "rotate-180",
						)}
					/>
					{expanded
						? t({ message: "Show fewer files" })
						: plural(hiddenCount, {
								one: "Show # more file",
								other: "Show # more files",
							})}
				</button>
			)}
		</div>
	);
}
