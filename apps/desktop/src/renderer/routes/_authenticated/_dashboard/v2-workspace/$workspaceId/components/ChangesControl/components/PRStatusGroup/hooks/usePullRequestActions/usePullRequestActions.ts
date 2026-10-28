import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";

type PullRequestTarget = {
	repoOwner: string;
	repoName: string;
	number: number;
};

type MergeMethod = "merge" | "squash" | "rebase";

export function usePullRequestActions({
	workspaceId,
	onRefresh,
}: {
	workspaceId: string;
	onRefresh?: () => void;
}) {
	const { t } = useLingui();
	// Triggers a GitHub→host-service-DB sync for this workspace's PR. Without
	// this, post-merge UI state lags by up to ~30s waiting for the next
	// background sync tick. Called after a successful merge before refetching
	// the local query.
	const refreshPRMutation =
		workspaceTrpc.pullRequests.refreshByWorkspaces.useMutation();

	const mergePRMutation = workspaceTrpc.github.mergePR.useMutation({
		onMutate: () => {
			const toastId = toast.loading(t({ message: "Merging PR..." }));
			return { toastId };
		},
		onSuccess: async (_data, _variables, context) => {
			toast.success(t({ message: "PR merged" }), { id: context?.toastId });
			try {
				await refreshPRMutation.mutateAsync({ workspaceIds: [workspaceId] });
			} catch (error) {
				console.warn("Failed to refresh PR state after merge", error);
				toast.warning(
					t({
						message:
							"Merged, but couldn't refresh PR state — try again in a moment",
					}),
				);
			} finally {
				onRefresh?.();
			}
		},
		onError: (error, _variables, context) => {
			toast.error(
				t({
					message: `Merge failed: ${error.message}`,
				}),
				{ id: context?.toastId },
			);
		},
	});

	const markReadyMutation =
		workspaceTrpc.github.markPullRequestReady.useMutation({
			onMutate: () => {
				const toastId = toast.loading(
					t({
						message: "Marking ready for review...",
					}),
				);
				return { toastId };
			},
			onSuccess: async (_data, _variables, context) => {
				toast.success(
					t({
						message: "PR ready for review",
					}),
					{ id: context?.toastId },
				);
				try {
					await refreshPRMutation.mutateAsync({ workspaceIds: [workspaceId] });
				} catch (error) {
					console.warn("Failed to refresh PR state after marking ready", error);
					toast.warning(
						t({
							message:
								"Marked ready, but couldn't refresh PR state — try again in a moment",
						}),
					);
				} finally {
					onRefresh?.();
				}
			},
			onError: (error, _variables, context) => {
				toast.error(
					t({
						message: `Ready for review failed: ${error.message}`,
					}),
					{ id: context?.toastId },
				);
			},
		});

	return {
		merge: (pr: PullRequestTarget, mergeMethod: MergeMethod) =>
			mergePRMutation.mutate({
				owner: pr.repoOwner,
				repo: pr.repoName,
				pullNumber: pr.number,
				mergeMethod,
			}),
		markReady: (pr: PullRequestTarget) =>
			markReadyMutation.mutate({
				owner: pr.repoOwner,
				repo: pr.repoName,
				pullNumber: pr.number,
			}),
		isMerging: mergePRMutation.isPending,
		isMarkingReady: markReadyMutation.isPending,
	};
}
