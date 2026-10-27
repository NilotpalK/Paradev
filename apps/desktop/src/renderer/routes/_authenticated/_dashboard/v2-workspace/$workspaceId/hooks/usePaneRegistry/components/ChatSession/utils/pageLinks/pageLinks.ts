import { parseSupersetAppLink } from "renderer/lib/supersetAppLink";

/**
 * A Superset link the chat shows as a card. `slug` is the dedupe key; an
 * environment's is prefixed so it can never match a page's.
 */
export type PageLink = { slug: string; url: string; environmentId?: string };

/** Every Superset page or environment a text links, once each, in the order it first names them. */
export type PageLinkFinder = (text: string) => PageLink[];

const URL_PATTERN = /https?:\/\/[^\s\p{Cc}<>"'`()[\]{}\\|^]+/gu;
const TRAILING_PUNCTUATION = /[.,;:!?*_~]+$/;

function cardUrlPrefixes(webUrl: string): string[] {
	try {
		const { origin } = new URL(webUrl);
		return [`${origin}/page/`, `${origin}/environments/`];
	} catch {
		return [];
	}
}

/**
 * Bound to the web origin once, because the transcript asks about every tool
 * output on every update and most of them link no page at all.
 */
export function pageLinkFinder(webUrl: string): PageLinkFinder {
	const prefixes = cardUrlPrefixes(webUrl);
	return (text) => {
		if (!prefixes.some((prefix) => text.includes(prefix))) return [];
		const links = new Map<string, PageLink>();
		for (const [candidate] of text.matchAll(URL_PATTERN)) {
			if (!prefixes.some((prefix) => candidate.startsWith(prefix))) continue;
			const url = candidate.replace(TRAILING_PUNCTUATION, "");
			const link = parseSupersetAppLink(url, webUrl);
			const card =
				link?.kind === "page"
					? { slug: link.slug, url }
					: link?.kind === "environment"
						? {
								slug: `environment:${link.environmentId}`,
								url,
								environmentId: link.environmentId,
							}
						: null;
			if (card && !links.has(card.slug)) links.set(card.slug, card);
		}
		return [...links.values()];
	};
}
