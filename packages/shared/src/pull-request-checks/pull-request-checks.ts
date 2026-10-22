import type {
	PullRequestCheck,
	PullRequestCheckStatus,
	PullRequestChecksStatus,
} from "../pull-request";

/** GitHub GraphQL `StatusCheckRollupContext` nodes, as `gh pr view --json statusCheckRollup` also prints them. */
export interface CheckRunNode {
	__typename: "CheckRun";
	name: string;
	conclusion: string | null;
	detailsUrl: string | null;
	status: string;
	startedAt: string | null;
	completedAt: string | null;
	checkSuite: {
		workflowRun: {
			databaseId: number | null;
		} | null;
	} | null;
}

export interface StatusContextNode {
	__typename: "StatusContext";
	context: string;
	state: string;
	targetUrl: string | null;
	createdAt: string | null;
}

export type CheckContextNode = CheckRunNode | StatusContextNode;

function mapCheckRunStatus(
	status: string,
	conclusion: string | null,
): PullRequestCheckStatus {
	if (status !== "COMPLETED") return "pending";

	switch (conclusion) {
		case "SUCCESS":
			return "success";
		case "FAILURE":
		case "TIMED_OUT":
		case "ACTION_REQUIRED":
			return "failure";
		case "CANCELLED":
			return "cancelled";
		case "SKIPPED":
		case "NEUTRAL":
			return "skipped";
		default:
			return "pending";
	}
}

function mapStatusContextState(state: string): PullRequestCheckStatus {
	switch (state) {
		case "SUCCESS":
			return "success";
		case "FAILURE":
		case "ERROR":
			return "failure";
		default:
			return "pending";
	}
}

function parseTime(timestamp: string | null): number {
	if (!timestamp) return 0;
	const time = Date.parse(timestamp);
	return Number.isNaN(time) ? 0 : time;
}

function getCheckRunRecency(node: CheckRunNode): number {
	const workflowRunId = node.checkSuite?.workflowRun?.databaseId;
	if (typeof workflowRunId === "number") return workflowRunId;
	return parseTime(node.completedAt ?? node.startedAt);
}

/** One row per check name; a re-run replaces the run it supersedes. */
export function parseCheckContexts(
	nodes: readonly (CheckContextNode | null)[],
): PullRequestCheck[] {
	const checks = nodes
		.filter((node): node is CheckContextNode => node !== null)
		.map((node) =>
			node.__typename === "CheckRun"
				? {
						name: node.name,
						status: mapCheckRunStatus(node.status, node.conclusion),
						url: node.detailsUrl,
						recency: getCheckRunRecency(node),
					}
				: {
						name: node.context,
						status: mapStatusContextState(node.state),
						url: node.targetUrl,
						recency: parseTime(node.createdAt),
					},
		);

	const dedupedChecks = new Map<string, (typeof checks)[number]>();
	for (const check of checks) {
		const existing = dedupedChecks.get(check.name);
		if (!existing || check.recency > existing.recency) {
			dedupedChecks.set(check.name, check);
		}
	}

	return [...dedupedChecks.values()].map(
		({ recency: _recency, ...check }) => check,
	);
}

export function computeChecksStatus(
	checks: readonly PullRequestCheck[],
): PullRequestChecksStatus {
	if (checks.length === 0) return "none";
	// A cancelled run never produced a real verdict — treat it as a failure
	// rather than falling through to "success".
	if (
		checks.some(
			(check) => check.status === "failure" || check.status === "cancelled",
		)
	) {
		return "failure";
	}
	if (checks.some((check) => check.status === "pending")) return "pending";
	return "success";
}
