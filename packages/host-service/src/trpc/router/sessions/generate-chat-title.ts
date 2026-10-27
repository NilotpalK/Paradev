import {
	emptySnapshot,
	reduceMany,
	userMessageText,
} from "@superset/chat/core";
import type {
	AgentMessage,
	DurableEnvelope,
	UserMessage,
} from "@superset/chat/protocol";
import type { HostDb } from "../../../db";
import { generateWorkspaceNamesFromPrompt } from "../workspace-creation/utils/ai-workspace-names";

const PROMPTS_FOR_TITLE = 3;
const SOURCE_CHARS = 2_000;

export type ChatTitleSource = { prompts: string; agentReply?: string };

export function chatTitleSource(
	envelopes: readonly DurableEnvelope[],
): ChatTitleSource | null {
	const items = [...reduceMany(emptySnapshot(), envelopes).items.values()]
		.map(({ item }) => item)
		.filter((item) => !item.parentItemId);
	const prompts = items
		.filter(
			(item): item is UserMessage =>
				item.kind === "user_message" &&
				!(item as UserMessage).queued &&
				!(item as UserMessage).discarded,
		)
		.map((message) => userMessageText(message).trim())
		.filter(Boolean)
		.slice(0, PROMPTS_FOR_TITLE);
	if (prompts.length === 0) return null;
	const agentReply = items
		.find(
			(item): item is AgentMessage =>
				item.kind === "agent_message" && !!(item as AgentMessage).text.trim(),
		)
		?.text.trim();
	return {
		prompts: prompts.join("\n\n").slice(0, SOURCE_CHARS),
		...(agentReply ? { agentReply: agentReply.slice(0, SOURCE_CHARS) } : {}),
	};
}

export function asNamingData(text: string): string {
	return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function generateChatTitle({
	envelopes,
	agent,
	db,
	signal,
	name = generateWorkspaceNamesFromPrompt,
}: {
	envelopes: readonly DurableEnvelope[];
	agent: string | undefined;
	db: HostDb;
	signal?: AbortSignal;
	name?: typeof generateWorkspaceNamesFromPrompt;
}): Promise<string | null> {
	const source = chatTitleSource(envelopes);
	if (!source) return null;
	const names = await name(
		asNamingData(source.prompts),
		agent ? { db, agent } : undefined,
		null,
		signal,
		true,
		source.agentReply
			? { agentReply: asNamingData(source.agentReply) }
			: undefined,
	);
	return names?.title || null;
}
