import type { PageLink, PageLinkFinder } from "../../../../utils/pageLinks";

const SETUP_SKILL = "superset:environment";

/**
 * The environment a setup session works on: the one its first message links
 * when that message asks for the setup skill, which is how Get started opens
 * the session.
 */
export function setupEnvironmentLink(
	firstUserMessage: string | null,
	findLinks: PageLinkFinder,
): PageLink | null {
	if (!firstUserMessage?.includes(SETUP_SKILL)) return null;
	return findLinks(firstUserMessage).find((link) => link.environmentId) ?? null;
}
