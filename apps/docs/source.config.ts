import {
	defineConfig,
	defineDocs,
	frontmatterSchema,
	metaSchema,
} from "fumadocs-mdx/config";
import { z } from "zod";

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
export const docs = defineDocs({
	dir: "content/docs",
	docs: {
		schema: frontmatterSchema.extend({
			pro: z.boolean().optional(),
		}),
		postprocess: {
			includeProcessedMarkdown: true,
		},
	},
	meta: {
		schema: metaSchema,
	},
});

/**
 * Pages written ahead of a launch. A draft replaces the published page at the
 * same path while its PostHog `flag` is on; nothing else (search, sitemap,
 * llms.txt) sees it until it moves to `content/docs`.
 */
export const drafts = defineDocs({
	dir: "drafts",
	docs: {
		schema: frontmatterSchema.extend({
			pro: z.boolean().optional(),
			flag: z.string(),
		}),
	},
	meta: {
		schema: metaSchema,
	},
});

export default defineConfig({
	mdxOptions: {
		// MDX options
	},
});
