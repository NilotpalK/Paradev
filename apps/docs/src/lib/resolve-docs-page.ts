import { drafts } from "fumadocs-mdx:collections/server";
import { type InferPageType, loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { isSiteFlagEnabled } from "./feature-flags";
import { source } from "./source";

const draftSource = loader({
	baseUrl: "/",
	source: drafts.toFumadocsSource(),
	plugins: [lucideIconsPlugin()],
});

export type DocsPage =
	| InferPageType<typeof source>
	| InferPageType<typeof draftSource>;

/** The published page, or its draft in `drafts/` while the draft's flag is on. */
export async function resolveDocsPage(
	slug: string[] | undefined,
): Promise<{ page: DocsPage; contentPath: string } | null> {
	const draft = draftSource.getPage(slug);
	if (draft && (await isSiteFlagEnabled(draft.data.flag))) {
		return { page: draft, contentPath: `apps/docs/drafts/${draft.path}` };
	}
	const page = source.getPage(slug);
	return page
		? { page, contentPath: `apps/docs/content/docs/${page.path}` }
		: null;
}
