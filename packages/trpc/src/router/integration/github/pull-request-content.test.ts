import { describe, expect, test } from "bun:test";
import {
	pullRequestContentQuerySchema,
	toPullRequestContent,
} from "./pull-request-content";

const node = {
	number: 12,
	title: "Read pull requests as the viewer",
	body: null,
	url: "https://github.com/owner/repo/pull/12",
	state: "OPEN",
	isDraft: false,
	createdAt: "2026-10-01T10:00:00Z",
	updatedAt: "2026-10-02T10:00:00Z",
	mergedAt: null,
	closedAt: null,
	mergeable: "CONFLICTING",
	additions: 10,
	deletions: -1,
	changedFiles: 2,
	reviewDecision: "CHANGES_REQUESTED",
	headRefName: "feat/viewer",
	baseRefName: "main",
	isCrossRepository: true,
	headRepository: { nameWithOwner: "fork/repo" },
	author: { login: "satya", avatarUrl: "https://avatars/satya" },
	labels: { nodes: [{ name: "desktop", color: "1d76db" }, null] },
	reviewRequests: {
		nodes: [
			{ requestedReviewer: { login: "reviewer", name: "Rev Ewer" } },
			{ requestedReviewer: null },
		],
	},
	reviews: {
		nodes: [
			{
				id: "R1",
				author: { login: "Reviewer", name: null },
				body: "Please fix",
				state: "CHANGES_REQUESTED",
				submittedAt: "2026-10-02T09:00:00Z",
			},
			{ id: "R2", author: { login: "pending" }, body: "", submittedAt: null },
		],
	},
	comments: {
		nodes: [
			{
				id: "C1",
				author: { login: "satya" },
				body: "On it",
				createdAt: "2026-10-02T09:30:00Z",
				url: "https://github.com/owner/repo/pull/12#issuecomment-1",
			},
		],
	},
	commits: {
		nodes: [
			{
				commit: {
					oid: "abc123",
					messageHeadline: "feat: viewer reads ",
					committedDate: "2026-10-01T09:00:00Z",
					authors: {
						nodes: [
							{ name: "Satya", user: null },
							{ name: null, user: null },
						],
					},
				},
			},
			{
				commit: { oid: "nodate", messageHeadline: "x", committedDate: null },
			},
		],
	},
	lastCommit: {
		nodes: [
			{
				commit: {
					statusCheckRollup: {
						contexts: {
							nodes: [
								{
									__typename: "CheckRun",
									name: "ci",
									status: "COMPLETED",
									conclusion: "FAILURE",
									detailsUrl: "https://ci/1",
									checkSuite: { workflowRun: { databaseId: 1 } },
								},
								{
									__typename: "CheckRun",
									name: "ci",
									status: "COMPLETED",
									conclusion: "SUCCESS",
									detailsUrl: "https://ci/2",
									checkSuite: { workflowRun: { databaseId: 2 } },
								},
								{
									__typename: "StatusContext",
									context: "lint",
									state: "PENDING",
									targetUrl: null,
								},
							],
						},
					},
				},
			},
		],
	},
};

describe("toPullRequestContent", () => {
	test("maps the GraphQL node to the shared pull request content", () => {
		const parsed = pullRequestContentQuerySchema.parse({
			repository: { pullRequest: node },
		});
		const content = toPullRequestContent(
			parsed.repository?.pullRequest as NonNullable<
				NonNullable<typeof parsed.repository>["pullRequest"]
			>,
			"owner/repo",
		);
		expect(content).toMatchObject({
			repoFullName: "owner/repo",
			number: 12,
			body: "",
			state: "open",
			author: { login: "satya", avatarUrl: "https://avatars/satya" },
			head: { ref: "feat/viewer", repoFullName: "fork/repo" },
			base: { ref: "main" },
			reviewDecision: "changes_requested",
			checksStatus: "pending",
			additions: 10,
			deletions: 0,
			changedFiles: 2,
			mergeability: "conflicting",
			labels: [{ name: "desktop", color: "1d76db" }],
		});
		// The re-run replaces the failed run of the same name.
		expect(content.checks).toEqual([
			{ name: "ci", status: "success", url: "https://ci/2" },
			{ name: "lint", status: "pending", url: null },
		]);
		expect(content.reviewers).toEqual([
			{ login: "reviewer", name: "Rev Ewer" },
		]);
		expect(content.comments.map((c) => [c.kind, c.id, c.reviewState])).toEqual([
			["comment", "C1", null],
			["review", "R1", "CHANGES_REQUESTED"],
		]);
		expect(content.commits).toEqual([
			{
				oid: "abc123",
				messageHeadline: "feat: viewer reads",
				committedDate: "2026-10-01T09:00:00Z",
				author: { login: null, name: "Satya" },
				url: "https://github.com/owner/repo/pull/12/commits/abc123",
			},
		]);
	});

	test("a merged pull request reads as merged even when GitHub says closed", () => {
		const parsed = pullRequestContentQuerySchema.parse({
			repository: {
				pullRequest: {
					...node,
					state: "CLOSED",
					mergedAt: "2026-10-03T00:00:00Z",
					lastCommit: null,
				},
			},
		});
		const pullRequest = parsed.repository?.pullRequest;
		if (!pullRequest) throw new Error("expected a pull request");
		const content = toPullRequestContent(pullRequest, "owner/repo");
		expect(content.state).toBe("merged");
		expect(content.mergedAt).toBe("2026-10-03T00:00:00Z");
		expect(content.checks).toEqual([]);
		expect(content.checksStatus).toBe("none");
	});
});
