import type { PullRequestCheck } from "@superset/shared/pull-request";
import type {
	GitHubPullRequestNode,
	GitHubPullRequestReviewDecision,
} from "../github-query";

export {
	computeChecksStatus,
	parseCheckContexts,
} from "@superset/shared/pull-request-checks";
export type { PullRequestCheck };

export type PullRequestState =
	| "open"
	| "draft"
	| "merged"
	| "closed"
	| "queued";
export type ReviewDecision =
	| "approved"
	| "changes_requested"
	| "pending"
	| null;
export type ChecksStatus = "success" | "failure" | "pending" | "none";

export function mapPullRequestState(
	state: GitHubPullRequestNode["state"],
	isDraft: boolean,
	isInMergeQueue = false,
): PullRequestState {
	if (state === "MERGED") return "merged";
	if (state === "CLOSED") return "closed";
	if (isDraft) return "draft";
	if (isInMergeQueue) return "queued";
	return "open";
}

export function mapReviewDecision(
	value: GitHubPullRequestReviewDecision,
): ReviewDecision {
	if (value === "APPROVED") return "approved";
	if (value === "CHANGES_REQUESTED") return "changes_requested";
	if (value === "REVIEW_REQUIRED") return "pending";
	return null;
}

export function coercePullRequestState(value: string | null): PullRequestState {
	if (
		value === "merged" ||
		value === "closed" ||
		value === "draft" ||
		value === "queued"
	) {
		return value;
	}
	return "open";
}

export function coerceReviewDecision(value: string | null): ReviewDecision {
	if (
		value === "approved" ||
		value === "changes_requested" ||
		value === "pending"
	) {
		return value;
	}
	return null;
}

export function coerceChecksStatus(value: string | null): ChecksStatus {
	if (value === "success" || value === "failure" || value === "pending") {
		return value;
	}
	return "none";
}

export function parseChecksJson(value: string | null): PullRequestCheck[] {
	if (!value) return [];

	try {
		const parsed = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];

		return parsed.filter(
			(item): item is PullRequestCheck =>
				typeof item === "object" &&
				item !== null &&
				typeof item.name === "string" &&
				typeof item.status === "string" &&
				(item.url === null || typeof item.url === "string"),
		);
	} catch {
		return [];
	}
}
