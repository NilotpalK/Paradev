import { parseSupersetAppLink } from "renderer/lib/supersetAppLink";

const SETUP_SKILL = "superset:environment";
const URL_PATTERN = /https?:\/\/[^\s)>\]]+/g;

/**
 * The environment a setup session works on: the one its first message links
 * when that message asks for the setup skill, which is how Get started opens
 * the session.
 */
export function setupEnvironmentId(
	firstUserMessage: string | null,
	webUrl: string,
): string | null {
	if (!firstUserMessage?.includes(SETUP_SKILL)) return null;
	for (const [url] of firstUserMessage.matchAll(URL_PATTERN)) {
		const link = parseSupersetAppLink(url, webUrl);
		if (link?.kind === "environment") return link.environmentId;
	}
	return null;
}
