// Kept separate from constants.ts: apps/mobile/app.config.ts imports this, and
// every file it imports is an input to the Expo runtime fingerprint.

const IOS_TEAM_ID = "NV9657CS5A";
const IOS_BUNDLE_ID = "sh.superset.mobile";

export const IOS_APP = {
	TEAM_ID: IOS_TEAM_ID,
	BUNDLE_ID: IOS_BUNDLE_ID,
	APP_ID: `${IOS_TEAM_ID}.${IOS_BUNDLE_ID}`,
} as const;

// Mobile bundles inline only EXPO_PUBLIC_*. The desktop renderer has no
// process global; its build defines NEXT_PUBLIC_ROOT_DOMAIN non-empty, so the
// second read never runs there.
export function readRootDomain(): string {
	return (
		process.env.NEXT_PUBLIC_ROOT_DOMAIN ||
		process.env.EXPO_PUBLIC_ROOT_DOMAIN ||
		"superset.sh"
	);
}

export const ROOT_DOMAIN = readRootDomain();

// Production hosts. Unlike COMPANY.MARKETING_URL/DOCS_URL, they ignore per-deployment URL overrides.
// The API and web app keep their hosts when the root domain changes: released
// clients call them, and OAuth clients have their redirect URIs registered there.
export const CANONICAL_URLS = {
	MARKETING: `https://${ROOT_DOMAIN}`,
	API: "https://api.superset.sh",
	APP: "https://app.superset.sh",
	DOCS: `https://docs.${ROOT_DOMAIN}`,
} as const;
