import { env } from "@/env";

const DOCS_SITE_DISTINCT_ID = "docs-site";
const FLAG_REVALIDATE_SECONDS = 300;

/**
 * Evaluated for the whole site, not per reader, who is anonymous here. A flag
 * targeted by email is off; rolling it out to everyone turns it on. A cached
 * fetch rather than posthog-node, so pages stay static and rebuild on the
 * revalidate interval.
 */
export async function isSiteFlagEnabled(flag: string): Promise<boolean> {
	if (!env.NEXT_PUBLIC_POSTHOG_KEY) return false;
	const host = env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
	try {
		const response = await fetch(`${host}/flags?v=2`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				api_key: env.NEXT_PUBLIC_POSTHOG_KEY,
				distinct_id: DOCS_SITE_DISTINCT_ID,
				flag_keys_to_evaluate: [flag],
			}),
			cache: "force-cache",
			next: { revalidate: FLAG_REVALIDATE_SECONDS },
		});
		if (!response.ok) return false;
		const body = (await response.json()) as {
			flags?: Record<string, { enabled?: boolean }>;
		};
		return body.flags?.[flag]?.enabled === true;
	} catch (error) {
		console.error(`[docs] could not evaluate flag ${flag}`, error);
		return false;
	}
}
