/**
 * Where the reader was in a chat, kept across a resume that replaces its
 * session. The replacement replays the conversation under new item ids, so
 * the place is told by user message rather than by id.
 */
export type ReaderPosition = {
	userMessagesFromEnd: number;
	messageText: string;
	/** How far the viewport top is below the top of that message. */
	offsetPx: number;
};

const readers = new Map<string, () => ReaderPosition | null>();
const carried = new Map<string, ReaderPosition>();

export function trackReaderPosition(
	sessionId: string,
	read: () => ReaderPosition | null,
): () => void {
	readers.set(sessionId, read);
	return () => {
		if (readers.get(sessionId) === read) readers.delete(sessionId);
	};
}

export function carryReaderPosition(
	fromSessionId: string,
	toSessionId: string,
): void {
	const position = readers.get(fromSessionId)?.() ?? null;
	if (position) carried.set(toSessionId, position);
	else carried.delete(toSessionId);
}

export function carriedReaderPosition(
	sessionId: string,
): ReaderPosition | null {
	return carried.get(sessionId) ?? null;
}

export function forgetCarriedReaderPosition(sessionId: string): void {
	carried.delete(sessionId);
}
