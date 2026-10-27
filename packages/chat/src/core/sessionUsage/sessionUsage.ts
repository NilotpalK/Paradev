import type { SessionUsage, Turn } from "../../protocol/envelope";

function reportedUsage(turn: Turn): SessionUsage | null {
	if (turn.sessionUsage) return turn.sessionUsage;
	const contextUsed = turn.usage?.contextUsed;
	const contextSize = turn.usage?.contextSize;
	return contextUsed !== undefined && contextSize
		? { contextUsed, contextSize }
		: null;
}

export function latestSessionUsage(
	turns: ReadonlyMap<string, Turn>,
): SessionUsage | null {
	let latest: SessionUsage | null = null;
	for (const turn of turns.values()) latest = reportedUsage(turn) ?? latest;
	return latest;
}
