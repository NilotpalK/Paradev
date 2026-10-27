import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import {
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useMemo, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { HiCheck } from "react-icons/hi2";
import { LuRefreshCw } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { githubAppSettingsUrl } from "renderer/lib/github/githubAppSettingsUrl";
import { RepositorySourcePicker } from "./components/RepositorySourcePicker";
import type { GitHubInstallationOption } from "./types";

interface PickRepositoriesStepProps {
	organizationId: string;
	installations: readonly GitHubInstallationOption[];
	accountLogin: string | null;
	isStarting: boolean;
	/** Set when the organization is at its environment limit. */
	reachedLimit?: number | null;
	onManageEnvironments: () => void;
	onUpgrade: () => void;
	/** Picked earlier, when coming back from choosing the primary. */
	initialSelectedIds?: readonly string[];
	onContinue: (
		repositories: ReadonlyArray<{ id: string; name: string; fullName: string }>,
	) => void;
	onConnectOrg: () => void;
	onCancel: () => void;
}

export function PickRepositoriesStep({
	organizationId,
	installations,
	accountLogin,
	isStarting,
	reachedLimit = null,
	onManageEnvironments,
	onUpgrade,
	initialSelectedIds = [],
	onContinue,
	onConnectOrg,
	onCancel,
}: PickRepositoriesStepProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const repositories = cloudTrpc.integration.github.listRepositories.useQuery(
		{ organizationId },
		{ refetchOnWindowFocus: "always" },
	);
	const resync = cloudTrpc.integration.github.triggerSync.useMutation({
		onSuccess: async () => {
			await utils.integration.github.listRepositories.invalidate();
			toast.success(t({ message: "Repositories refreshed" }));
		},
		onError: (error) => toast.error(errorMessage(error)),
	});
	const [sourceId, setSourceId] = useState<string | null>(null);
	const [selectedIds, setSelectedIds] = useState<string[]>([
		...initialSelectedIds,
	]);

	// Picked repositories lead, in the order picked, so the primary stays in view.
	const shown = useMemo(() => {
		const inSource = (repositories.data ?? []).filter(
			(repository) =>
				sourceId === null || repository.installationId === sourceId,
		);
		const picked = selectedIds
			.map((id) => inSource.find((repository) => repository.id === id))
			.filter((repository) => repository !== undefined);
		return [
			...picked,
			...inSource.filter((repository) => !selectedIds.includes(repository.id)),
		];
	}, [repositories.data, sourceId, selectedIds]);
	const selected = selectedIds
		.map((id) => repositories.data?.find((repository) => repository.id === id))
		.filter((repository) => repository !== undefined);
	const toggle = (id: string) =>
		setSelectedIds((ids) =>
			ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id],
		);
	const configurable =
		installations.find((installation) => installation.id === sourceId) ??
		installations[0];

	return (
		<>
			<DialogHeader className="px-5 pt-5 pb-4 text-left">
				<DialogTitle className="text-base leading-tight">
					<Trans>Create a cloud environment</Trans>
				</DialogTitle>
				<DialogDescription className="text-sm leading-snug">
					<Trans>
						Pick the repositories it checks out. An agent on this machine works
						out what to install and gets it running in the cloud.
					</Trans>
				</DialogDescription>
				<p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
					<FaGithub className="size-3.5" />
					{accountLogin ? (
						<Trans>Connected to GitHub as {accountLogin}</Trans>
					) : (
						<Trans>Pull requests open as the Superset GitHub App</Trans>
					)}
				</p>
			</DialogHeader>
			<div className="flex flex-col gap-2 px-5 pb-5">
				<div className="flex items-center justify-between">
					<span className="text-xs font-medium">
						<Trans>Repositories</Trans>
					</span>
					<RepositorySourcePicker
						installations={installations}
						onConnectOrg={onConnectOrg}
						onSelect={setSourceId}
						selectedId={sourceId}
					/>
				</div>
				<div className="overflow-hidden rounded-md border">
					<Command>
						<CommandInput
							placeholder={t({ message: "Search repositories..." })}
						/>
						<CommandList className="h-56">
							<CommandEmpty className="px-3 py-6 text-center text-xs text-muted-foreground">
								{repositories.isLoading ? (
									<Trans>Loading repositories...</Trans>
								) : (
									<Trans>No repositories found.</Trans>
								)}
							</CommandEmpty>
							<CommandGroup>
								{shown.map((repository) => {
									const position = selectedIds.indexOf(repository.id);
									return (
										<CommandItem
											className="rounded-md"
											key={repository.id}
											onSelect={() => toggle(repository.id)}
											value={repository.fullName}
										>
											<FaGithub className="size-4 shrink-0 text-muted-foreground" />
											<span className="flex-1 truncate">
												{repository.fullName}
											</span>
											{position >= 0 && (
												<HiCheck className="size-4 shrink-0 text-foreground" />
											)}
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				</div>
				<div className="flex items-center justify-between text-xs text-muted-foreground">
					{configurable ? (
						<span>
							<Trans>Missing a repository?</Trans>{" "}
							<button
								className="text-foreground underline underline-offset-2"
								onClick={() =>
									window.open(githubAppSettingsUrl(configurable), "_blank")
								}
								type="button"
							>
								<Trans>Configure access</Trans>
							</button>
						</span>
					) : (
						<span />
					)}
					<button
						className="inline-flex items-center gap-1.5 hover:text-foreground"
						disabled={resync.isPending}
						onClick={() => resync.mutate({ organizationId })}
						type="button"
					>
						<LuRefreshCw
							className={resync.isPending ? "size-3 animate-spin" : "size-3"}
						/>
						<Trans>Refresh</Trans>
					</button>
				</div>
			</div>
			{reachedLimit !== null && (
				<div className="flex items-center gap-3 border-t border-border/70 px-5 py-3 text-xs text-muted-foreground">
					<span className="flex-1">
						{reachedLimit === 0 ? (
							<Trans>Your plan does not include cloud environments.</Trans>
						) : (
							<Trans>
								Your organization has reached its limit of {reachedLimit}{" "}
								environments. Archive one to make room.
							</Trans>
						)}
					</span>
					{reachedLimit === 0 ? (
						<Button onClick={onUpgrade} size="sm" variant="outline">
							<Trans>Upgrade</Trans>
						</Button>
					) : (
						<Button onClick={onManageEnvironments} size="sm" variant="outline">
							<Trans>Manage environments</Trans>
						</Button>
					)}
				</div>
			)}
			<DialogFooter className="items-center border-t border-border/70 bg-muted/20 px-5 py-3">
				<span className="flex-1 text-xs text-muted-foreground">
					{selected.length === 0 ? (
						<Trans>None selected</Trans>
					) : (
						<Trans>{selected.length} selected</Trans>
					)}
				</span>
				<Button onClick={onCancel} size="sm" variant="ghost">
					<Trans>Cancel</Trans>
				</Button>
				<Button
					disabled={
						selected.length === 0 || isStarting || reachedLimit !== null
					}
					onClick={() => onContinue(selected)}
					size="sm"
				>
					{isStarting ? (
						<Trans>Starting…</Trans>
					) : selected.length > 1 ? (
						<Trans>Next</Trans>
					) : (
						<Trans>Get started</Trans>
					)}
				</Button>
			</DialogFooter>
		</>
	);
}
