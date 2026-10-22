/**
 * Everything one pull request view needs, read live from GitHub.
 *
 * Deliberately GraphQL and deliberately live: mergeability, per-viewer
 * capabilities, reviewer states and whether a check is required exist
 * nowhere in the synced rows, and a button offered on stale data is a
 * button that fails when pressed.
 */

export interface PullRequestDetailInput {
	owner: string;
	repo: string;
	pullNumber: number;
}

export interface PullRequestDetailClient {
	graphql: <T>(query: string, variables: Record<string, unknown>) => Promise<T>;
	/**
	 * `GET /repos/{owner}/{repo}/pulls/{n}/requested_reviewers`. REST because
	 * every GraphQL Team field needs the read:org scope, which tokens minted by
	 * editors and GitHub Desktop lack.
	 */
	requestedReviewers: (input: PullRequestDetailInput) => Promise<{
		users: { login: string; avatar_url?: string | null }[];
		teams: { name: string }[];
	}>;
}

/** GitHub answered, but not with a pull request: the caller maps the code onto its own error type. */
export class PullRequestReadError extends Error {
	constructor(
		readonly code: "NOT_FOUND" | "CONFLICT",
		message: string,
	) {
		super(message);
		this.name = "PullRequestReadError";
	}
}

export interface PullRequestDetailCheck {
	name: string;
	status: string;
	conclusion: string | null;
	isRequired: boolean;
	startedAt: string | null;
	completedAt: string | null;
	detailsUrl: string | null;
}

export interface PullRequestDetailReviewer {
	login: string;
	avatarUrl: string | null;
	isTeam: boolean;
	state: string;
}

export interface PullRequestDetailRead {
	pullRequest: {
		id: string;
		number: number;
		title: string;
		body: string;
		url: string;
		baseBranch: string;
		state: "open" | "closed" | "merged";
		isDraft: boolean;
		additions: number;
		deletions: number;
		changedFiles: number;
		mergedAt: string | null;
		mergedBy: { login: string; avatarUrl: string | null } | null;
	};
	checks: PullRequestDetailCheck[];
	reviewers: PullRequestDetailReviewer[];
	mergeability: {
		mergeable: string;
		mergeStateStatus: string;
		approvals: number;
		requiredApprovals: number;
		reviewDecision: string | null;
		unresolvedThreads: number;
		requiresThreadResolution: boolean;
		queue: { position: number | null; state: string } | null;
		allowedMergeMethods: string[];
	};
	capabilities: {
		merge: boolean;
		markReady: boolean;
		updateBranch: boolean;
		reopen: boolean;
		dequeue: boolean;
	};
}

/**
 * `isRequired` is asked per pull request because a check is only required
 * relative to the branch rules it runs under.
 */
const PULL_REQUEST_DETAIL_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
	repository(owner: $owner, name: $name) {
		squashMergeAllowed
		mergeCommitAllowed
		rebaseMergeAllowed
		pullRequest(number: $number) {
			id number title body url baseRefName state isDraft merged mergedAt
			additions deletions changedFiles
			mergeable mergeStateStatus reviewDecision
			viewerCanUpdate viewerCanMergeAsAdmin
			mergedBy { login avatarUrl }
			mergeQueueEntry { position state }
			baseRef {
				branchProtectionRule {
					requiredApprovingReviewCount
					requiresConversationResolution
				}
			}
			latestOpinionatedReviews(first: 20) {
				nodes { state author { login avatarUrl } }
			}
			reviewThreads(first: 100) {
				pageInfo { hasNextPage endCursor }
				nodes { isResolved isOutdated }
			}
			statusCheckRollup {
				contexts(first: 100) {
					pageInfo { hasNextPage endCursor }
					nodes {
						__typename
						... on CheckRun {
							name status conclusion detailsUrl startedAt completedAt
							isRequired(pullRequestNumber: $number)
						}
						... on StatusContext {
							context state targetUrl createdAt
							isRequired(pullRequestNumber: $number)
						}
					}
				}
			}
		}
	}
}`;

const REVIEW_THREADS_PAGE_QUERY = `
query($owner: String!, $name: String!, $number: Int!, $cursor: String!) {
	repository(owner: $owner, name: $name) {
		pullRequest(number: $number) {
			reviewThreads(first: 100, after: $cursor) {
				pageInfo { hasNextPage endCursor }
				nodes { isResolved isOutdated }
			}
		}
	}
}`;

const CHECK_CONTEXTS_PAGE_QUERY = `
query($owner: String!, $name: String!, $number: Int!, $cursor: String!) {
	repository(owner: $owner, name: $name) {
		pullRequest(number: $number) {
			statusCheckRollup {
				contexts(first: 100, after: $cursor) {
					pageInfo { hasNextPage endCursor }
					nodes {
						__typename
						... on CheckRun {
							name status conclusion detailsUrl startedAt completedAt
							isRequired(pullRequestNumber: $number)
						}
						... on StatusContext {
							context state targetUrl createdAt
							isRequired(pullRequestNumber: $number)
						}
					}
				}
			}
		}
	}
}`;

interface ConnectionPageInfo {
	hasNextPage: boolean;
	endCursor: string | null;
}

interface ReviewThreadNode {
	isResolved: boolean;
	isOutdated: boolean;
}

interface ReviewThreadsConnection {
	pageInfo: ConnectionPageInfo;
	nodes: (ReviewThreadNode | null)[];
}

interface CheckContextNode {
	__typename: string;
	name?: string;
	status?: string;
	conclusion?: string | null;
	detailsUrl?: string | null;
	startedAt?: string | null;
	completedAt?: string | null;
	context?: string;
	state?: string;
	targetUrl?: string | null;
	createdAt?: string | null;
	isRequired?: boolean;
}

interface CheckContextsConnection {
	pageInfo: ConnectionPageInfo;
	nodes: (CheckContextNode | null)[];
}

export interface PullRequestDetailQuery {
	repository: {
		squashMergeAllowed: boolean;
		mergeCommitAllowed: boolean;
		rebaseMergeAllowed: boolean;
		pullRequest: {
			id: string;
			number: number;
			title: string;
			body: string;
			url: string;
			baseRefName: string;
			state: string;
			isDraft: boolean;
			merged: boolean;
			mergedAt: string | null;
			additions: number;
			deletions: number;
			changedFiles: number;
			mergeable: string;
			mergeStateStatus: string;
			reviewDecision: string | null;
			viewerCanUpdate: boolean;
			viewerCanMergeAsAdmin: boolean;
			mergedBy: { login: string; avatarUrl: string | null } | null;
			mergeQueueEntry: { position: number | null; state: string } | null;
			baseRef: {
				branchProtectionRule: {
					requiredApprovingReviewCount: number | null;
					requiresConversationResolution: boolean | null;
				} | null;
			} | null;
			latestOpinionatedReviews: {
				nodes: ({
					state: string;
					author: { login: string; avatarUrl: string | null } | null;
				} | null)[];
			} | null;
			reviewThreads: ReviewThreadsConnection | null;
			statusCheckRollup: {
				contexts: CheckContextsConnection | null;
			} | null;
		} | null;
	} | null;
}

/**
 * 100 nodes is GitHub's page cap, not a promise of completeness — a failing
 * required check or an open thread past the first page would otherwise never
 * be seen, and the card would grade a partial pull request as ready. Drains
 * the connection; a handful of round trips at most.
 *
 * GitHub's own flags are trusted but not absolutely: a stuck cursor from a
 * GitHub-side pagination bug must not turn one detail query into an infinite
 * loop that pins the server and burns the token's rate limit. 20 pages is
 * 2,000 nodes — far past any real pull request.
 */
const MAX_DRAIN_PAGES = 20;

async function drain<Node>(
	what: string,
	input: PullRequestDetailInput,
	pageInfo: ConnectionPageInfo | undefined,
	fetchPage: (
		cursor: string,
	) => Promise<
		{ pageInfo: ConnectionPageInfo; nodes: Node[] } | null | undefined
	>,
): Promise<Node[]> {
	const nodes: Node[] = [];
	let page = pageInfo ?? null;
	let pages = 0;
	while (page?.hasNextPage) {
		// hasNextPage with no cursor would end the loop on a partial set —
		// the silent truncation this drain exists to remove.
		if (!page.endCursor) {
			throw new PullRequestReadError(
				"CONFLICT",
				`GitHub reported more ${what} but no cursor for pull request #${input.pullNumber}.`,
			);
		}
		if (++pages > MAX_DRAIN_PAGES) {
			throw new PullRequestReadError(
				"CONFLICT",
				`Pull request #${input.pullNumber} did not finish paginating ${what} after ${MAX_DRAIN_PAGES} pages.`,
			);
		}
		const connection = await fetchPage(page.endCursor);
		if (!connection) {
			throw new PullRequestReadError(
				"CONFLICT",
				`GitHub returned no ${what} page for pull request #${input.pullNumber} while paginating.`,
			);
		}
		nodes.push(...connection.nodes);
		page = connection.pageInfo;
	}
	return nodes;
}

function variables(input: PullRequestDetailInput, cursor?: string) {
	return {
		owner: input.owner,
		name: input.repo,
		number: input.pullNumber,
		...(cursor === undefined ? {} : { cursor }),
	};
}

export async function readPullRequestDetail(
	client: PullRequestDetailClient,
	input: PullRequestDetailInput,
): Promise<PullRequestDetailRead> {
	const data = await client.graphql<PullRequestDetailQuery>(
		PULL_REQUEST_DETAIL_QUERY,
		variables(input),
	);
	const pr = data.repository?.pullRequest;
	if (!pr) {
		throw new PullRequestReadError(
			"NOT_FOUND",
			`Pull request #${input.pullNumber} not found.`,
		);
	}

	// Both connections page at 100; anything past the first page must be
	// fetched before grading, or a failing check or open thread there is
	// silently invisible.
	const [restThreads, restContexts, requested] = await Promise.all([
		drain(
			"review threads",
			input,
			pr.reviewThreads?.pageInfo,
			async (cursor) =>
				(
					await client.graphql<{
						repository: {
							pullRequest: {
								reviewThreads: ReviewThreadsConnection | null;
							} | null;
						} | null;
					}>(REVIEW_THREADS_PAGE_QUERY, variables(input, cursor))
				).repository?.pullRequest?.reviewThreads,
		),
		drain(
			"checks",
			input,
			pr.statusCheckRollup?.contexts?.pageInfo,
			async (cursor) =>
				(
					await client.graphql<{
						repository: {
							pullRequest: {
								statusCheckRollup: {
									contexts: CheckContextsConnection | null;
								} | null;
							} | null;
						} | null;
					}>(CHECK_CONTEXTS_PAGE_QUERY, variables(input, cursor))
				).repository?.pullRequest?.statusCheckRollup?.contexts,
		),
		client.requestedReviewers(input),
	]);

	const reviewers = new Map<string, PullRequestDetailReviewer>();
	// Requested first, so an actual review overwrites the placeholder.
	for (const user of requested.users) {
		reviewers.set(user.login, {
			login: user.login,
			avatarUrl: user.avatar_url ?? null,
			isTeam: false,
			state: "REQUESTED",
		});
	}
	for (const team of requested.teams) {
		reviewers.set(team.name, {
			login: team.name,
			avatarUrl: null,
			isTeam: true,
			state: "REQUESTED",
		});
	}
	for (const node of pr.latestOpinionatedReviews?.nodes ?? []) {
		const who = node?.author;
		if (!node || !who?.login) continue;
		reviewers.set(who.login, {
			login: who.login,
			avatarUrl: who.avatarUrl ?? null,
			isTeam: false,
			state: node.state,
		});
	}

	const checks = (pr.statusCheckRollup?.contexts?.nodes ?? [])
		.concat(restContexts)
		.flatMap((node): PullRequestDetailCheck[] => {
			if (!node) return [];
			if (node.__typename === "CheckRun") {
				return [
					{
						name: node.name ?? "Check",
						status: node.status ?? "COMPLETED",
						conclusion: node.conclusion ?? null,
						isRequired: node.isRequired ?? false,
						startedAt: node.startedAt ?? null,
						completedAt: node.completedAt ?? null,
						detailsUrl: node.detailsUrl ?? null,
					},
				];
			}
			// A commit status has no runtime of its own, only a verdict.
			return [
				{
					name: node.context ?? "Status",
					status: "COMPLETED",
					conclusion:
						node.state === "SUCCESS"
							? "SUCCESS"
							: node.state === "PENDING"
								? null
								: "FAILURE",
					isRequired: node.isRequired ?? false,
					startedAt: null,
					completedAt: node.createdAt ?? null,
					detailsUrl: node.targetUrl ?? null,
				},
			];
		});

	const threads = (pr.reviewThreads?.nodes ?? []).concat(restThreads);
	const allowed: string[] = [];
	if (data.repository?.squashMergeAllowed) allowed.push("squash");
	if (data.repository?.mergeCommitAllowed) allowed.push("merge");
	if (data.repository?.rebaseMergeAllowed) allowed.push("rebase");

	return {
		pullRequest: {
			id: pr.id,
			number: pr.number,
			title: pr.title,
			body: pr.body,
			url: pr.url,
			baseBranch: pr.baseRefName,
			state: pr.merged ? "merged" : pr.state === "CLOSED" ? "closed" : "open",
			isDraft: pr.isDraft,
			additions: pr.additions,
			deletions: pr.deletions,
			changedFiles: pr.changedFiles,
			mergedAt: pr.mergedAt,
			mergedBy: pr.mergedBy
				? { login: pr.mergedBy.login, avatarUrl: pr.mergedBy.avatarUrl ?? null }
				: null,
		},
		checks,
		reviewers: [...reviewers.values()],
		mergeability: {
			mergeable: pr.mergeable,
			mergeStateStatus: pr.mergeStateStatus,
			approvals: (pr.latestOpinionatedReviews?.nodes ?? []).filter(
				(node) => node?.state === "APPROVED",
			).length,
			requiredApprovals:
				pr.baseRef?.branchProtectionRule?.requiredApprovingReviewCount ?? 0,
			// GitHub's own verdict, and the only one that sees rulesets — a
			// repository that requires review through a ruleset has no
			// branchProtectionRule at all, so the count above reads 0.
			reviewDecision: pr.reviewDecision,
			unresolvedThreads: threads.filter(
				(node) => node && !node.isResolved && !node.isOutdated,
			).length,
			requiresThreadResolution:
				pr.baseRef?.branchProtectionRule?.requiresConversationResolution ??
				false,
			queue: pr.mergeQueueEntry
				? {
						position: pr.mergeQueueEntry.position ?? null,
						state: pr.mergeQueueEntry.state,
					}
				: null,
			allowedMergeMethods: allowed,
		},
		capabilities: {
			// Permission only. Whether GitHub would accept the merge right now
			// is mergeStateStatus's job — gating the button on mergeability
			// makes it vanish while GitHub is still computing it.
			merge: pr.viewerCanMergeAsAdmin || pr.viewerCanUpdate,
			markReady: pr.isDraft && pr.viewerCanUpdate,
			updateBranch: pr.mergeStateStatus === "BEHIND" && pr.viewerCanUpdate,
			reopen: pr.state === "CLOSED" && !pr.merged && pr.viewerCanUpdate,
			dequeue: pr.mergeQueueEntry !== null && pr.viewerCanUpdate,
		},
	};
}

/** The GraphQL mutations address the pull request by node id, not number. */
export async function pullRequestNodeId(
	client: Pick<PullRequestDetailClient, "graphql">,
	input: PullRequestDetailInput,
): Promise<string> {
	const data = await client.graphql<{
		repository: { pullRequest: { id: string } | null } | null;
	}>(
		`query($owner: String!, $name: String!, $number: Int!) {
			repository(owner: $owner, name: $name) { pullRequest(number: $number) { id } }
		}`,
		variables(input),
	);
	const id = data.repository?.pullRequest?.id;
	if (!id) {
		throw new PullRequestReadError(
			"NOT_FOUND",
			`Pull request #${input.pullNumber} not found.`,
		);
	}
	return id;
}
