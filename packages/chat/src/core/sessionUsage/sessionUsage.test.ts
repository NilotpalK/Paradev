import { describe, expect, it } from "bun:test";
import type { Turn } from "../../protocol/envelope";
import { latestSessionUsage } from "./sessionUsage";

function turns(...list: Turn[]): Map<string, Turn> {
	return new Map(list.map((turn) => [turn.id, turn]));
}

describe("latestSessionUsage", () => {
	it("keeps the newest report when a later turn has not reported yet", () => {
		expect(
			latestSessionUsage(
				turns(
					{
						id: "t1",
						status: "completed",
						startedAtMs: 1,
						sessionUsage: { contextUsed: 10, contextSize: 100 },
					},
					{
						id: "t2",
						status: "completed",
						startedAtMs: 2,
						sessionUsage: { contextUsed: 40, contextSize: 100, costUsd: 1 },
					},
					{ id: "t3", status: "running", startedAtMs: 3 },
				),
			),
		).toEqual({ contextUsed: 40, contextSize: 100, costUsd: 1 });
	});

	it("reads the context a turn's usage reports when it has no session usage", () => {
		expect(
			latestSessionUsage(
				turns({
					id: "t1",
					status: "running",
					startedAtMs: 1,
					usage: {
						inputTokens: 5,
						cachedInputTokens: 0,
						outputTokens: 2,
						contextUsed: 7,
						contextSize: 1_000,
					},
				}),
			),
		).toEqual({ contextUsed: 7, contextSize: 1_000 });
	});
});
