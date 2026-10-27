import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Dialog, DialogContent } from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { env } from "renderer/env.renderer";
import { useCreateAgentSession } from "renderer/hooks/useCreateAgentSession";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { ChoosePrimaryStep } from "./components/ChoosePrimaryStep";
import { ConnectGitHubStep } from "./components/ConnectGitHubStep";
import { PickRepositoriesStep } from "./components/PickRepositoriesStep";

interface CreateEnvironmentFlowProps {
	organizationId: string;
	/** The project to link the new environment to, when started from one. */
	projectId?: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The setup session opened; the caller can get out of its way. */
	onStarted?: () => void;
}

/**
 * Create environment: connect GitHub when it isn't yet, pick repositories,
 * then hand the new environment to an agent in a local setup session.
 */
export function CreateEnvironmentFlow({
	organizationId,
	projectId,
	open,
	onOpenChange,
	onStarted,
}: CreateEnvironmentFlowProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	// Both connections finish in the browser; coming back to the window is
	// when they appear.
	const installations = cloudTrpc.integration.github.listInstallations.useQuery(
		{ organizationId },
		{ enabled: open, refetchOnWindowFocus: "always" },
	);
	const githubUser = cloudTrpc.githubUser.get.useQuery(undefined, {
		enabled: open,
		refetchOnWindowFocus: "always",
	});
	const usage = cloudTrpc.billing.environmentUsage.useQuery(undefined, {
		enabled: open,
	});
	const navigate = useNavigate();
	const [skippedAccount, setSkippedAccount] = useState(false);
	// Set once several repositories are picked: the step that asks for the primary.
	const [picked, setPicked] = useState<ReadonlyArray<{
		id: string;
		name: string;
		fullName: string;
	}> | null>(null);
	const [pickedIds, setPickedIds] = useState<string[]>([]);
	const create = cloudTrpc.environment.create.useMutation();
	const { createSession, isPending: isLaunching } = useCreateAgentSession();

	const activeInstallations = (installations.data ?? []).filter(
		(installation) => !installation.suspended,
	);
	const appInstalled = activeInstallations.length > 0;
	const accountConnected = !!githubUser.data?.connection;
	const accountAvailable = githubUser.data?.available !== false;
	const isLoading = installations.isPending || githubUser.isPending;
	const needsConnecting =
		!appInstalled || (accountAvailable && !accountConnected && !skippedAccount);

	const reachedLimit =
		usage.data?.limit != null && usage.data.used >= usage.data.limit
			? usage.data.limit
			: null;

	const openGitHubIntegration = () => {
		window.open(`${env.NEXT_PUBLIC_WEB_URL}/integrations/github`, "_blank");
	};

	const getStarted = async (
		repositories: ReadonlyArray<{ id: string; name: string }>,
		primaryId = repositories[0]?.id,
	) => {
		const primary = repositories.find(
			(repository) => repository.id === primaryId,
		);
		if (!primary) return;
		try {
			const environment = await create.mutateAsync({
				organizationId,
				name: primary.name,
				repositoryIds: [
					primary.id,
					...repositories
						.filter((repository) => repository.id !== primary.id)
						.map((repository) => repository.id),
				],
				primaryRepositoryId: primary.id,
				scope: "personal",
				...(projectId ? { projectId } : {}),
			});
			await Promise.all([
				utils.environment.list.invalidate(),
				utils.billing.environmentUsage.invalidate(),
			]);
			const url = new URL(
				`/environments/${environment.id}`,
				env.NEXT_PUBLIC_WEB_URL,
			).toString();
			onOpenChange(false);
			onStarted?.();
			await createSession(
				`Use the superset:environment skill to set up cloud environment ${environment.name} (${environment.id}): ${url}`,
				{
					preset: "claude",
					preferChat: true,
					name: t({ message: `Set up ${environment.name}` }),
				},
			);
		} catch (error) {
			toast.error(errorMessage(error));
		}
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="flex flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[480px]">
				{needsConnecting ? (
					<ConnectGitHubStep
						accountAvailable={accountAvailable}
						accountLogin={githubUser.data?.connection?.login ?? null}
						appAccountLogin={
							appInstalled
								? activeInstallations
										.map((installation) => installation.accountLogin)
										.join(", ")
								: null
						}
						isLoading={isLoading}
						onCancel={() => onOpenChange(false)}
						onContinue={() => setSkippedAccount(true)}
						onInstallApp={openGitHubIntegration}
					/>
				) : picked ? (
					<ChoosePrimaryStep
						isStarting={create.isPending || isLaunching}
						onBack={() => setPicked(null)}
						onGetStarted={(primaryId) => getStarted(picked, primaryId)}
						repositories={picked}
					/>
				) : (
					<PickRepositoriesStep
						initialSelectedIds={pickedIds}
						accountLogin={githubUser.data?.connection?.login ?? null}
						installations={activeInstallations}
						isStarting={create.isPending || isLaunching}
						reachedLimit={reachedLimit}
						onManageEnvironments={() => {
							onOpenChange(false);
							void navigate({ to: "/settings/environments" });
						}}
						onUpgrade={() => {
							onOpenChange(false);
							void navigate({ to: "/settings/billing/plans" });
						}}
						onCancel={() => onOpenChange(false)}
						onConnectOrg={openGitHubIntegration}
						onContinue={(repositories) => {
							setPickedIds(repositories.map((repository) => repository.id));
							if (repositories.length > 1) setPicked(repositories);
							else void getStarted(repositories);
						}}
						organizationId={organizationId}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
