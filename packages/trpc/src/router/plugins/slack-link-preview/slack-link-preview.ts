import { parseSlackLink } from "@superset/shared/slack-links";
import type { PluginTarget, TargetRequest } from "../proxy";
import {
	readDescribedMessages,
	readDescribedUser,
} from "../servers/slack/tools";

export type SlackLinkPreview =
	| { status: "ready"; title: string | null; description: string | null }
	| { status: "unavailable" };

export type SlackLinkPreviewDeps = {
	resolveTarget(request: TargetRequest): Promise<PluginTarget>;
	callTool(
		target: PluginTarget,
		tool: string,
		args: Record<string, unknown>,
	): Promise<unknown>;
};

const UNAVAILABLE: SlackLinkPreview = { status: "unavailable" };
const MAX_DESCRIPTION = 300;
const MENTION = /^<@([UW][A-Z0-9]+)>$/;

function outputText(result: unknown): string | null {
	const output = result as {
		isError?: boolean;
		content?: { type: string; text?: string }[];
	} | null;
	if (!output || output.isError || !Array.isArray(output.content)) return null;
	return output.content
		.flatMap((part) => (part.type === "text" && part.text ? [part.text] : []))
		.join("\n");
}

function plainText(markup: string): string {
	const text = markup
		.replace(/<([^<>|]+)\|([^<>]+)>/g, "$2")
		.replace(/<(https?:[^<>]+)>/g, "$1")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim();
	return text.length > MAX_DESCRIPTION
		? `${text.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…`
		: text;
}

/**
 * What a Slack link points at, read with the viewer's own Slack connection:
 * a message's author and text, or a person's name and title. Anything short
 * of one ready connection and a found message reads as unavailable.
 */
export async function loadSlackLinkPreview(
	deps: SlackLinkPreviewDeps,
	request: { href: string; userId: string; organizationId: string | null },
): Promise<SlackLinkPreview> {
	const link = parseSlackLink(request.href);
	if (!link) return UNAVAILABLE;
	let target: PluginTarget;
	try {
		target = await deps.resolveTarget({
			userId: request.userId,
			organizationId: request.organizationId,
			plugin: "slack",
		});
	} catch {
		return UNAVAILABLE;
	}
	if (target.kind !== "first-party" && target.kind !== "remote") {
		return UNAVAILABLE;
	}
	const call = async (tool: string, args: Record<string, unknown>) =>
		outputText(await deps.callTool(target, tool, args).catch(() => null)) ?? "";
	const nameOf = async (user: string) =>
		readDescribedUser(await call("get_user", { user }));

	if (link.kind === "user") {
		const user = await nameOf(link.user);
		return user
			? { status: "ready", title: user.name, description: user.title }
			: UNAVAILABLE;
	}
	const output = link.threadTs
		? await call("get_thread_replies", {
				channel: link.channel,
				thread_ts: link.threadTs,
				limit: 100,
			})
		: await call("get_message", { channel: link.channel, ts: link.ts });
	const message = readDescribedMessages(output).find(
		(candidate) => candidate.ts === link.ts,
	);
	if (!message) return UNAVAILABLE;
	const mentioned = MENTION.exec(message.sender)?.[1];
	const author = mentioned
		? ((await nameOf(mentioned))?.name ?? null)
		: message.sender;
	return {
		status: "ready",
		title: author,
		description: plainText(message.text) || null,
	};
}
