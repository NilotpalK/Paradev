import type { useMessageScroller } from "@superset/chat-ui/MessageScroller";
import { type RefObject, useEffect, useRef, useState } from "react";
import {
	carriedReaderPosition,
	forgetCarriedReaderPosition,
	type ReaderPosition,
	trackReaderPosition,
} from "../../../../utils/carriedReaderPosition";
import { rowMessageId, type TranscriptRow } from "../../utils/transcriptRows";
import { anchorRow, rowText, userMessageRows } from "./utils/anchorRow";

function readPosition(
	viewport: HTMLElement,
	rows: readonly TranscriptRow[],
): ReaderPosition | null {
	const top = viewport.getBoundingClientRect().top;
	const users = userMessageRows(rows);
	for (let fromEnd = 0; fromEnd < users.length; fromEnd++) {
		const row = users[users.length - 1 - fromEnd];
		if (!row) continue;
		const element = viewport.querySelector(
			`[data-message-id="${CSS.escape(rowMessageId(row))}"]`,
		);
		if (!element) continue;
		const elementTop = element.getBoundingClientRect().top;
		if (elementTop > top) continue;
		return {
			userMessagesFromEnd: fromEnd,
			messageText: rowText(row),
			offsetPx: top - elementTop,
		};
	}
	return null;
}

/**
 * Records where the reader is so a resume can carry it to the replacement
 * session, and returns to a carried place once this transcript has rows.
 * Returns the key of the row it returns to, which must stay mounted.
 */
export function useCarriedReaderPosition({
	sessionId,
	rows,
	viewport,
	awayFromEndRef,
	scrollerRef,
}: {
	sessionId: string;
	rows: readonly TranscriptRow[];
	viewport: HTMLElement | null;
	awayFromEndRef: RefObject<boolean>;
	scrollerRef: RefObject<ReturnType<typeof useMessageScroller>>;
}): string | null {
	const rowsRef = useRef(rows);
	rowsRef.current = rows;
	useEffect(() => {
		if (!viewport) return;
		return trackReaderPosition(sessionId, () =>
			awayFromEndRef.current ? readPosition(viewport, rowsRef.current) : null,
		);
	}, [sessionId, viewport, awayFromEndRef]);

	const [carried, setCarried] = useState(() =>
		carriedReaderPosition(sessionId),
	);
	useEffect(() => () => forgetCarriedReaderPosition(sessionId), [sessionId]);

	const anchor = carried && rows.length > 0 ? anchorRow(rows, carried) : null;
	const anchorId = anchor ? rowMessageId(anchor) : null;
	const hasRows = rows.length > 0;
	useEffect(() => {
		if (!carried || !hasRows) return;
		if (anchorId === null) {
			setCarried(null);
			return;
		}
		// After the scroller's own jump to the end for its first rows.
		const frame = requestAnimationFrame(() => {
			scrollerRef.current.scrollToMessage(anchorId, {
				align: "start",
				scrollMargin: -carried.offsetPx,
			});
			setCarried(null);
		});
		return () => cancelAnimationFrame(frame);
	}, [carried, hasRows, anchorId, scrollerRef]);

	return anchor?.key ?? null;
}
