import { describe, expect, test } from "bun:test";
import {
	channelNotificationContent,
	channelNotificationPath,
} from "./channelNotification";

const event = (
	overrides: Partial<Parameters<typeof channelNotificationContent>[0]> = {},
): Parameters<typeof channelNotificationContent>[0] => ({
	type: "channel.notify",
	organizationId: "o",
	channelId: "c",
	channelName: "eng",
	messageId: "m",
	threadRootId: null,
	reason: "mention",
	authorName: "Kiet Ho",
	preview: "shipped it",
	showPreview: true,
	...overrides,
});

describe("channelNotificationContent", () => {
	test("channel messages and thread replies", () => {
		expect(channelNotificationContent(event())).toEqual({
			title: "New message in #eng",
			body: "Kiet Ho: shipped it",
		});
		expect(channelNotificationContent(event({ threadRootId: "r" })).title).toBe(
			"New thread message in #eng",
		);
	});

	test("without a preview names only the sender", () => {
		expect(
			channelNotificationContent(event({ showPreview: false, preview: "" }))
				.body,
		).toBe("a message from Kiet Ho");
	});
});

describe("channelNotificationPath", () => {
	test("opens the thread, or jumps to the message", () => {
		expect(channelNotificationPath(event({ threadRootId: "r" }))).toBe(
			"/channels/c?thread=r",
		);
		expect(channelNotificationPath(event())).toBe("/channels/c?message=m");
	});
});
