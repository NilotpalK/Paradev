import { parseSupersetPageUrl } from "renderer/lib/parseSupersetPageUrl";

export type SupersetAppLink =
	| { kind: "page"; slug: string }
	| { kind: "task"; taskId: string }
	| { kind: "automation"; automationId: string }
	| { kind: "plugin"; pluginName: string }
	| { kind: "workspace"; workspaceId: string }
	| { kind: "chat"; workspaceId: string; sessionId: string };

const ROUTES: [RegExp, (id: string) => SupersetAppLink][] = [
	[/^\/tasks\/([^/]+)\/?$/, (taskId) => ({ kind: "task", taskId })],
	[
		/^\/automations\/([^/]+)\/?$/,
		(automationId) => ({ kind: "automation", automationId }),
	],
	[/^\/plugins\/([^/]+)\/?$/, (pluginName) => ({ kind: "plugin", pluginName })],
	[
		/^\/workspaces\/([^/]+)\/?$/,
		(workspaceId) => ({ kind: "workspace", workspaceId }),
	],
];

function decode(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

export function parseSupersetAppLink(
	href: string,
	webUrl: string,
): SupersetAppLink | null {
	let url: URL;
	let web: URL;
	try {
		url = new URL(href);
		web = new URL(webUrl);
	} catch {
		return null;
	}
	if (url.origin !== web.origin) return null;
	const slug = parseSupersetPageUrl(href, webUrl);
	if (slug) return { kind: "page", slug };
	for (const [pattern, build] of ROUTES) {
		const segment = url.pathname.match(pattern)?.[1];
		if (!segment) continue;
		const link = build(decode(segment));
		const sessionId = url.searchParams.get("sessionId");
		return link.kind === "workspace" && sessionId
			? { kind: "chat", workspaceId: link.workspaceId, sessionId }
			: link;
	}
	return null;
}

/** The shareable link to one chat: its workspace, opened on that session. */
export function chatReferenceUrl(
	workspaceId: string,
	sessionId: string,
	webUrl: string,
): string {
	const url = new URL(`/workspaces/${encodeURIComponent(workspaceId)}`, webUrl);
	url.searchParams.set("sessionId", sessionId);
	return url.toString();
}
