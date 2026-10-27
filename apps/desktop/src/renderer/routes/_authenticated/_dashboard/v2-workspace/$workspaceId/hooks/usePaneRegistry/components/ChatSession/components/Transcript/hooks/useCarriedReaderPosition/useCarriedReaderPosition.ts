import type { useMessageScroller } from "@superset/chat-ui/MessageScroller";
import {
	type RefObject,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import {
	carriedReaderPosition,
	forgetCarriedReaderPosition,
	type ReaderPosition,
	trackReaderPosition,
} from "../../../../utils/carriedReaderPosition";
import { rowElement } from "../../utils/rowElement";
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
		const element = rowElement(viewport, rowMessageId(row));
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

/** Returns the key of the row being returned to, which must stay mounted. */
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
	useLayoutEffect(() => forgetCarriedReaderPosition(sessionId), [sessionId]);

	const anchor = carried && rows.length > 0 ? anchorRow(rows, carried) : null;
	const anchorId = anchor ? rowMessageId(anchor) : null;
	const hasRows = rows.length > 0;
	useLayoutEffect(() => {
		if (!carried || !hasRows || !viewport) return;
		if (anchorId === null) {
			setCarried(null);
			return;
		}
		let current = true;
		// The scroller jumps to the end for its first rows from a MutationObserver
		// callback; a microtask queued here runs after it and before the paint.
		queueMicrotask(() => {
			if (!current) return;
			const content = rowElement(viewport, anchorId)?.parentElement;
			// The scroller aligns to the content's padding edge, not its border edge.
			const contentPadding = content
				? Number.parseFloat(getComputedStyle(content).paddingTop) || 0
				: 0;
			scrollerRef.current.scrollToMessage(anchorId, {
				align: "start",
				scrollMargin: -(carried.offsetPx + contentPadding),
			});
			setCarried(null);
		});
		return () => {
			current = false;
		};
	}, [carried, hasRows, anchorId, scrollerRef, viewport]);

	return anchor?.key ?? null;
}
