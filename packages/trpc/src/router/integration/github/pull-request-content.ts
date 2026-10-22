import type {
	PullRequestActor,
	PullRequestCommit,
	PullRequestCommitAuthor,
	PullRequestContent,
	PullRequestConversationComment,
	PullRequestMergeability,
} from "@superset/shared/pull-request";
import {
	computeChecksStatus,
	parseCheckContexts,
} from "@superset/shared/pull-request-checks";
import { z } from "zod";
import { toPullRequestState, toReviewDecision } from "./pull-request-shape";

/** The fields `gh pr view --json` reads, asked for in one request. */
export const PULL_REQUEST_CONTENT_QUERY = `
	query($owner: String!, $name: String!, $number: Int!) {
		repository(owner: $owner, name: $name) {
			pullRequest(number: $number) {
				number title body url state isDraft createdAt updatedAt mergedAt closedAt
				mergeable additions deletions changedFiles reviewDecision
				headRefName baseRefName isCrossRepository
				headRepository { nameWithOwner }
				author { login avatarUrl }
				labels(first: 50) { nodes { name color } }
				reviewRequests(first: 50) {
					nodes {
						requestedReviewer {
							... on User { login name }
							... on Mannequin { login }
							... on Team { login: slug name }
						}
					}
				}
				reviews(first: 100) {
					nodes { id author { login ... on User { name } } body state submittedAt }
				}
				comments(first: 100) {
					nodes { id author { login ... on User { name } } body createdAt url }
				}
				commits(last: 100) {
					nodes {
						commit {
							oid messageHeadline committedDate
							authors(first: 3) { nodes { name user { login } } }
						}
					}
				}
				lastCommit: commits(last: 1) {
					nodes {
						commit {
							statusCheckRollup {
								contexts(first: 100) {
									nodes {
										__typename
										... on CheckRun {
											name status conclusion detailsUrl startedAt completedAt
											checkSuite { workflowRun { databaseId } }
										}
										... on StatusContext { context state targetUrl createdAt }
									}
								}
							}
						}
					}
				}
			}
		}
	}
`;

const actorSchema = z
	.object({
		login: z.string().nullable().optional(),
		name: z.string().nullable().optional(),
		avatarUrl: z.string().nullable().optional(),
	})
	.nullable()
	.optional();

const nodes = <T extends z.ZodTypeAny>(node: T) =>
	z
		.object({ nodes: z.array(node.nullable()).nullable().optional() })
		.nullable()
		.optional();

const checkRunNode = z.object({
	__typename: z.literal("CheckRun"),
	name: z.string(),
	status: z.string(),
	conclusion: z.string().nullable().optional(),
	detailsUrl: z.string().nullable().optional(),
	startedAt: z.string().nullable().optional(),
	completedAt: z.string().nullable().optional(),
	checkSuite: z
		.object({
			workflowRun: z.object({ databaseId: z.number().nullable() }).nullable(),
		})
		.nullable()
		.optional(),
});
const statusContextNode = z.object({
	__typename: z.literal("StatusContext"),
	context: z.string(),
	state: z.string(),
	targetUrl: z.string().nullable().optional(),
	createdAt: z.string().nullable().optional(),
});

export const pullRequestContentNodeSchema = z.object({
	number: z.number(),
	title: z.string(),
	body: z.string().nullable().optional(),
	url: z.string(),
	state: z.string(),
	isDraft: z.boolean(),
	createdAt: z.string(),
	updatedAt: z.string(),
	mergedAt: z.string().nullable().optional(),
	closedAt: z.string().nullable().optional(),
	mergeable: z.string().nullable().optional(),
	additions: z.number().nullable().optional(),
	deletions: z.number().nullable().optional(),
	changedFiles: z.number().nullable().optional(),
	reviewDecision: z.string().nullable().optional(),
	headRefName: z.string(),
	baseRefName: z.string(),
	isCrossRepository: z.boolean(),
	headRepository: z.object({ nameWithOwner: z.string() }).nullable().optional(),
	author: actorSchema,
	labels: nodes(
		z.object({ name: z.string(), color: z.string().nullable().optional() }),
	),
	reviewRequests: nodes(z.object({ requestedReviewer: actorSchema })),
	reviews: nodes(
		z.object({
			id: z.string(),
			author: actorSchema,
			body: z.string().nullable().optional(),
			state: z.string().nullable().optional(),
			submittedAt: z.string().nullable().optional(),
		}),
	),
	comments: nodes(
		z.object({
			id: z.string(),
			author: actorSchema,
			body: z.string().nullable().optional(),
			createdAt: z.string(),
			url: z.string().nullable().optional(),
		}),
	),
	commits: nodes(
		z.object({
			commit: z.object({
				oid: z.string(),
				messageHeadline: z.string().nullable().optional(),
				committedDate: z.string().nullable().optional(),
				authors: nodes(
					z.object({
						name: z.string().nullable().optional(),
						user: z.object({ login: z.string() }).nullable().optional(),
					}),
				),
			}),
		}),
	),
	lastCommit: nodes(
		z.object({
			commit: z.object({
				statusCheckRollup: z
					.object({
						contexts: nodes(
							z.discriminatedUnion("__typename", [
								checkRunNode,
								statusContextNode,
							]),
						),
					})
					.nullable()
					.optional(),
			}),
		}),
	),
});

export const pullRequestContentQuerySchema = z.object({
	repository: z
		.object({ pullRequest: pullRequestContentNodeSchema.nullable() })
		.nullable(),
});

export type PullRequestContentNode = z.infer<
	typeof pullRequestContentNodeSchema
>;

function listOf<T>(
	connection: { nodes?: (T | null)[] | null } | null | undefined,
): T[] {
	return (connection?.nodes ?? []).filter((node): node is T => node !== null);
}

function toActor(actor: z.infer<typeof actorSchema>): PullRequestActor | null {
	const login = actor?.login?.trim();
	if (!login) return null;
	return { login, name: actor?.name?.trim() || null };
}

function toMergeability(
	mergeable: string | null | undefined,
): PullRequestMergeability {
	switch (mergeable?.toUpperCase()) {
		case "MERGEABLE":
			return "mergeable";
		case "CONFLICTING":
			return "conflicting";
		default:
			return "unknown";
	}
}

function count(value: number | null | undefined): number {
	return typeof value === "number" && value > 0 ? Math.floor(value) : 0;
}

export function toPullRequestContent(
	node: PullRequestContentNode,
	repoFullName: string,
): PullRequestContent {
	const contexts = listOf(
		listOf(node.lastCommit)[0]?.commit.statusCheckRollup?.contexts,
	).map((context) =>
		context.__typename === "CheckRun"
			? {
					...context,
					conclusion: context.conclusion ?? null,
					detailsUrl: context.detailsUrl ?? null,
					startedAt: context.startedAt ?? null,
					completedAt: context.completedAt ?? null,
					checkSuite: context.checkSuite ?? null,
				}
			: {
					...context,
					targetUrl: context.targetUrl ?? null,
					createdAt: context.createdAt ?? null,
				},
	);
	const checks = parseCheckContexts(contexts);
	const reviews = listOf(node.reviews).filter((review) => review.submittedAt);

	const reviewers = new Map<string, PullRequestActor>();
	for (const actor of [
		...listOf(node.reviewRequests).map((request) => request.requestedReviewer),
		...reviews.map((review) => review.author),
	]) {
		const reviewer = toActor(actor);
		if (!reviewer) continue;
		const known = reviewers.get(reviewer.login.toLowerCase());
		if (!known || (!known.name && reviewer.name)) {
			reviewers.set(reviewer.login.toLowerCase(), reviewer);
		}
	}

	const comments: PullRequestConversationComment[] = [
		...listOf(node.comments).map((comment) => ({
			id: comment.id,
			kind: "comment" as const,
			author: toActor(comment.author),
			body: comment.body ?? "",
			createdAt: comment.createdAt,
			reviewState: null,
			url: comment.url?.trim() || null,
		})),
		...reviews.map((review) => ({
			id: review.id,
			kind: "review" as const,
			author: toActor(review.author),
			body: review.body ?? "",
			createdAt: review.submittedAt as string,
			reviewState: review.state?.trim() || null,
			url: null,
		})),
	];

	const commits: PullRequestCommit[] = listOf(node.commits).flatMap(
		({ commit }) => {
			if (!commit.committedDate) return [];
			const author = listOf(commit.authors)
				.map(
					(entry): PullRequestCommitAuthor => ({
						login: entry.user?.login?.trim() || null,
						name: entry.name?.trim() || null,
					}),
				)
				.find((entry) => entry.login || entry.name);
			return [
				{
					oid: commit.oid,
					messageHeadline: commit.messageHeadline?.trim() ?? "",
					committedDate: commit.committedDate,
					author: author ?? null,
					url: `${node.url}/commits/${commit.oid}`,
				},
			];
		},
	);

	return {
		repoFullName,
		number: node.number,
		url: node.url,
		title: node.title,
		body: node.body ?? "",
		state: toPullRequestState(node.state.toLowerCase(), node.mergedAt ?? null),
		isDraft: node.isDraft,
		author: node.author?.login
			? { login: node.author.login, avatarUrl: node.author.avatarUrl ?? null }
			: null,
		head: {
			ref: node.headRefName,
			repoFullName: node.headRepository?.nameWithOwner ?? null,
		},
		base: { ref: node.baseRefName },
		reviewDecision: toReviewDecision(node.reviewDecision ?? null),
		checksStatus: computeChecksStatus(checks),
		checks,
		createdAt: node.createdAt,
		updatedAt: node.updatedAt,
		additions: count(node.additions),
		deletions: count(node.deletions),
		changedFiles: count(node.changedFiles),
		mergeability: toMergeability(node.mergeable),
		mergedAt: node.mergedAt?.trim() || null,
		closedAt: node.closedAt?.trim() || null,
		reviewers: [...reviewers.values()],
		comments,
		commits,
		labels: listOf(node.labels).map((label) => ({
			name: label.name,
			color: label.color?.trim() || null,
		})),
	};
}
