import { userMessageText } from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import type { ReaderPosition } from "../../../../../../utils/carriedReaderPosition";
import type { TranscriptRow } from "../../../../utils/transcriptRows";

export type UserMessageRow = Extract<TranscriptRow, { kind: "item" }>;

export function userMessageRows(
	rows: readonly TranscriptRow[],
): UserMessageRow[] {
	return rows.filter(
		(row): row is UserMessageRow =>
			row.kind === "item" && row.item.kind === "user_message",
	);
}

export function rowText(row: UserMessageRow): string {
	return userMessageText(row.item as UserMessage);
}

export function anchorRow(
	rows: readonly TranscriptRow[],
	position: ReaderPosition,
): UserMessageRow | null {
	const users = userMessageRows(rows);
	const expected = users.length - 1 - position.userMessagesFromEnd;
	let nearest: UserMessageRow | null = null;
	let nearestDistance = Number.POSITIVE_INFINITY;
	for (const [index, row] of users.entries()) {
		if (rowText(row) !== position.messageText) continue;
		const distance = Math.abs(index - expected);
		if (distance < nearestDistance) {
			nearest = row;
			nearestDistance = distance;
		}
	}
	return nearest ?? users[expected] ?? null;
}
