import type { PullRequestContent } from "@superset/shared/pull-request";
import {
	parseReviewThreads,
	REVIEW_THREADS_QUERY,
	type ReviewThreadsQueryResult,
} from "@superset/shared/pull-request-threads";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, userError } from "../../../trpc";
import { verifyOrgMembership } from "../utils";
import { githubRequestError } from "./github-request-error";
import {
	PULL_REQUEST_CONTENT_QUERY,
	pullRequestContentQuerySchema,
	toPullRequestContent,
} from "./pull-request-content";
import { viewerOctokit, viewerOnlyOctokit } from "./viewer-octokit";

export const pullRequestInputSchema = z.object({
	organizationId: z.string().uuid(),
	repoFullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
	number: z.number().int().positive(),
});

function repoOf(repoFullName: string): { owner: string; repo: string } {
	const [owner = "", repo = ""] = repoFullName.split("/");
	return { owner, repo };
}

/**
 * A pull request by its own identity, read and written as the person asking.
 * Nothing here needs a project or a host: the desktop reaches these for any
 * PR it can name, and falls back to a host's `gh` only when they are absent.
 */
export const pullRequestProcedures = {
	getPullRequestContent: protectedProcedure
		.input(pullRequestInputSchema)
		.query(async ({ ctx, input }): Promise<PullRequestContent> => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const { octokit } = await viewerOctokit({
				userId: ctx.session.user.id,
				...input,
			});
			const { owner, repo } = repoOf(input.repoFullName);
			let raw: unknown;
			try {
				raw = await octokit.graphql(PULL_REQUEST_CONTENT_QUERY, {
					owner,
					name: repo,
					number: input.number,
				});
			} catch (error) {
				throw githubRequestError(
					error,
					`Failed to read pull request #${input.number}`,
				);
			}
			const node =
				pullRequestContentQuerySchema.parse(raw).repository?.pullRequest;
			if (!node) {
				throw userError({
					code: "NOT_FOUND",
					message: "Pull request not found",
					i18nKey: "serverError.integration.pullRequestNotFound",
				});
			}
			return toPullRequestContent(node, input.repoFullName);
		}),

	getPullRequestThreads: protectedProcedure
		.input(pullRequestInputSchema)
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const { octokit } = await viewerOctokit({
				userId: ctx.session.user.id,
				...input,
			});
			const { owner, repo } = repoOf(input.repoFullName);
			try {
				const result: ReviewThreadsQueryResult = await octokit.graphql(
					REVIEW_THREADS_QUERY,
					{ owner, name: repo, prNumber: input.number },
				);
				return {
					reviewThreads: parseReviewThreads(result),
					fetchFailed: false,
				};
			} catch (error) {
				console.warn(
					`[github.getPullRequestThreads] review threads of ${input.repoFullName}#${input.number}:`,
					error instanceof Error ? error.message : error,
				);
				// An empty list rather than an error, so the diff still shows
				// when only its comments could not load; `fetchFailed` keeps the
				// two apart for the caller.
				return { reviewThreads: [], fetchFailed: true };
			}
		}),

	addPullRequestComment: protectedProcedure
		.input(
			pullRequestInputSchema.extend({
				// GitHub rejects bodies past 65536 characters.
				body: z.string().trim().min(1).max(65536),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const octokit = await viewerOnlyOctokit(ctx.session.user.id);
			try {
				const { data } = await octokit.request(
					"POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
					{
						...repoOf(input.repoFullName),
						issue_number: input.number,
						body: input.body,
					},
				);
				return { id: data.id, url: data.html_url };
			} catch (error) {
				throw githubRequestError(error, "GitHub refused the comment.");
			}
		}),

	replyToPullRequestThread: protectedProcedure
		.input(
			pullRequestInputSchema.extend({
				/** REST databaseId of any comment already in the thread. */
				commentId: z.number().int().positive(),
				body: z.string().trim().min(1).max(65536),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const octokit = await viewerOnlyOctokit(ctx.session.user.id);
			try {
				const { data } = await octokit.request(
					"POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies",
					{
						...repoOf(input.repoFullName),
						pull_number: input.number,
						comment_id: input.commentId,
						body: input.body,
					},
				);
				return { id: data.id };
			} catch (error) {
				throw githubRequestError(error, "GitHub refused the reply.");
			}
		}),

	setPullRequestThreadResolution: protectedProcedure
		.input(
			pullRequestInputSchema.extend({
				threadId: z.string().min(1),
				resolved: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const octokit = await viewerOnlyOctokit(ctx.session.user.id);
			const mutation = input.resolved
				? `mutation($threadId: ID!) {
					resolveReviewThread(input: {threadId: $threadId}) { thread { id isResolved } }
				}`
				: `mutation($threadId: ID!) {
					unresolveReviewThread(input: {threadId: $threadId}) { thread { id isResolved } }
				}`;
			try {
				await octokit.graphql(mutation, { threadId: input.threadId });
			} catch (error) {
				throw githubRequestError(error, "GitHub refused to update the thread.");
			}
			return { threadId: input.threadId, isResolved: input.resolved };
		}),

	mergePullRequest: protectedProcedure
		.input(
			pullRequestInputSchema.extend({
				mergeMethod: z.enum(["merge", "squash", "rebase"]).default("merge"),
				commitMessage: z.string().trim().min(1).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const octokit = await viewerOnlyOctokit(ctx.session.user.id);
			try {
				const { data } = await octokit.request(
					"PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge",
					{
						...repoOf(input.repoFullName),
						pull_number: input.number,
						merge_method: input.mergeMethod,
						...(input.commitMessage
							? { commit_message: input.commitMessage }
							: {}),
					},
				);
				return { merged: data.merged, sha: data.sha, message: data.message };
			} catch (error) {
				throw githubRequestError(error, "GitHub refused the merge.");
			}
		}),

	setPullRequestState: protectedProcedure
		.input(
			// Only open/closed: a merged pull request has no way back.
			pullRequestInputSchema.extend({ state: z.enum(["open", "closed"]) }),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const octokit = await viewerOnlyOctokit(ctx.session.user.id);
			try {
				await octokit.request(
					"PATCH /repos/{owner}/{repo}/pulls/{pull_number}",
					{
						...repoOf(input.repoFullName),
						pull_number: input.number,
						state: input.state,
					},
				);
			} catch (error) {
				throw githubRequestError(
					error,
					`GitHub refused to ${input.state === "closed" ? "close" : "reopen"} the pull request.`,
				);
			}
			return { ok: true as const };
		}),

	setPullRequestDraft: protectedProcedure
		.input(pullRequestInputSchema.extend({ draft: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const octokit = await viewerOnlyOctokit(ctx.session.user.id);
			const { owner, repo } = repoOf(input.repoFullName);
			try {
				const found = z
					.object({
						repository: z
							.object({
								pullRequest: z.object({ id: z.string() }).nullable(),
							})
							.nullable(),
					})
					.parse(
						await octokit.graphql(
							`query($owner: String!, $name: String!, $number: Int!) {
								repository(owner: $owner, name: $name) { pullRequest(number: $number) { id } }
							}`,
							{ owner, name: repo, number: input.number },
						),
					);
				const pullRequestId = found.repository?.pullRequest?.id;
				if (!pullRequestId) {
					throw userError({
						code: "NOT_FOUND",
						message: "Pull request not found",
						i18nKey: "serverError.integration.pullRequestNotFound",
					});
				}
				await octokit.graphql(
					input.draft
						? `mutation($pullRequestId: ID!) {
							convertPullRequestToDraft(input: {pullRequestId: $pullRequestId}) { pullRequest { isDraft } }
						}`
						: `mutation($pullRequestId: ID!) {
							markPullRequestReadyForReview(input: {pullRequestId: $pullRequestId}) { pullRequest { isDraft } }
						}`,
					{ pullRequestId },
				);
			} catch (error) {
				throw githubRequestError(
					error,
					input.draft
						? "GitHub refused to convert the pull request to a draft."
						: "GitHub refused to mark the pull request ready for review.",
				);
			}
			return { ok: true as const };
		}),
} satisfies TRPCRouterRecord;
