import { describe, expect, test } from "bun:test";
import {
	type PullRequestDetailQuery,
	PullRequestReadError,
	readPullRequestDetail,
} from "./pull-request-detail";

const input = { owner: "acme", repo: "widgets", pullNumber: 7 };

function pullRequest(
	overrides: Partial<
		NonNullable<
			NonNullable<PullRequestDetailQuery["repository"]>["pullRequest"]
		>
	> = {},
): PullRequestDetailQuery {
	return {
		repository: {
			squashMergeAllowed: true,
			mergeCommitAllowed: false,
			rebaseMergeAllowed: true,
			pullRequest: {
				id: "PR_1",
				number: 7,
				title: "Widgets",
				body: "",
				url: "https://github.com/acme/widgets/pull/7",
				baseRefName: "main",
				state: "OPEN",
				isDraft: false,
				merged: false,
				mergedAt: null,
				additions: 3,
				deletions: 1,
				changedFiles: 2,
				mergeable: "MERGEABLE",
				mergeStateStatus: "BEHIND",
				reviewDecision: "REVIEW_REQUIRED",
				viewerCanUpdate: true,
				viewerCanMergeAsAdmin: false,
				mergedBy: null,
				mergeQueueEntry: null,
				baseRef: {
					branchProtectionRule: {
						requiredApprovingReviewCount: 2,
						requiresConversationResolution: true,
					},
				},
				latestOpinionatedReviews: {
					nodes: [
						{ state: "APPROVED", author: { login: "maya", avatarUrl: "m" } },
						{
							state: "CHANGES_REQUESTED",
							author: { login: "lee", avatarUrl: null },
						},
					],
				},
				reviewThreads: {
					pageInfo: { hasNextPage: true, endCursor: "c1" },
					nodes: [{ isResolved: false, isOutdated: false }],
				},
				statusCheckRollup: {
					contexts: {
						pageInfo: { hasNextPage: false, endCursor: null },
						nodes: [
							{
								__typename: "CheckRun",
								name: "CI / Typecheck",
								status: "COMPLETED",
								conclusion: "FAILURE",
								isRequired: true,
							},
							{
								__typename: "StatusContext",
								context: "lint",
								state: "PENDING",
							},
						],
					},
				},
				...overrides,
			},
		},
	};
}

describe("readPullRequestDetail", () => {
	test("drains every page before grading, and a review outranks a request", async () => {
		const queries: string[] = [];
		const detail = await readPullRequestDetail(
			{
				graphql: async <T>(
					query: string,
					variables: Record<string, unknown>,
				) => {
					queries.push(String(variables.cursor ?? "first"));
					if (variables.cursor === "c1") {
						return {
							repository: {
								pullRequest: {
									reviewThreads: {
										pageInfo: { hasNextPage: false, endCursor: null },
										nodes: [{ isResolved: false, isOutdated: true }, null],
									},
								},
							},
						} as T;
					}
					return pullRequest() as T;
				},
				requestedReviewers: async () => ({
					users: [{ login: "maya", avatar_url: "m" }, { login: "sam" }],
					teams: [{ name: "platform" }],
				}),
			},
			input,
		);
		expect(queries).toEqual(["first", "c1"]);
		expect(detail.reviewers).toEqual([
			{ login: "maya", avatarUrl: "m", isTeam: false, state: "APPROVED" },
			{ login: "sam", avatarUrl: null, isTeam: false, state: "REQUESTED" },
			{ login: "platform", avatarUrl: null, isTeam: true, state: "REQUESTED" },
			{
				login: "lee",
				avatarUrl: null,
				isTeam: false,
				state: "CHANGES_REQUESTED",
			},
		]);
		expect(detail.mergeability).toMatchObject({
			approvals: 1,
			requiredApprovals: 2,
			unresolvedThreads: 1,
			requiresThreadResolution: true,
			allowedMergeMethods: ["squash", "rebase"],
		});
		expect(
			detail.checks.map((check) => [check.name, check.conclusion]),
		).toEqual([
			["CI / Typecheck", "FAILURE"],
			["lint", null],
		]);
		expect(detail.capabilities).toEqual({
			merge: true,
			markReady: false,
			updateBranch: true,
			reopen: false,
			dequeue: false,
		});
	});

	test("a page without a cursor fails the read rather than grading a partial set", async () => {
		await expect(
			readPullRequestDetail(
				{
					graphql: async <T>() =>
						pullRequest({
							reviewThreads: {
								pageInfo: { hasNextPage: true, endCursor: null },
								nodes: [],
							},
						}) as T,
					requestedReviewers: async () => ({ users: [], teams: [] }),
				},
				input,
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	test("a missing pull request is NOT_FOUND", async () => {
		const error = await readPullRequestDetail(
			{
				graphql: async <T>() => ({ repository: { pullRequest: null } }) as T,
				requestedReviewers: async () => ({ users: [], teams: [] }),
			},
			input,
		).catch((e) => e);
		expect(error).toBeInstanceOf(PullRequestReadError);
		expect(error.code).toBe("NOT_FOUND");
	});
});
