import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { ChannelRealtimeEvent } from "@superset/shared/channels";

type ChannelNotifyEvent = Extract<
	ChannelRealtimeEvent,
	{ type: "channel.notify" }
>;

/** Slack's wording: "New message in #ch" over "Name: text", or "a message from Name" without a preview. */
export function channelNotificationContent(event: ChannelNotifyEvent): {
	title: string;
	body: string;
} {
	const { authorName, channelName, preview } = event;
	const title = event.threadRootId
		? i18n._(msg({ message: `New thread message in #${channelName}` }))
		: i18n._(msg({ message: `New message in #${channelName}` }));
	const body =
		event.showPreview === false || !preview
			? i18n._(msg({ message: `a message from ${authorName}` }))
			: `${authorName}: ${preview}`;
	return { title, body };
}

/** One per conversation, so reading it can dismiss what it showed. */
export function channelNotificationGroup(event: {
	channelId: string;
	threadRootId: string | null;
}): string {
	return event.threadRootId
		? `channel-thread:${event.threadRootId}`
		: `channel:${event.channelId}`;
}

export function channelNotificationPath(event: ChannelNotifyEvent): string {
	const params = new URLSearchParams(
		event.threadRootId
			? { thread: event.threadRootId }
			: { message: event.messageId },
	);
	return `/channels/${event.channelId}?${params}`;
}
