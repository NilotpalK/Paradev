/**
 * The setup session's first message: runs the superset:environment skill,
 * which the desktop provisions onto every machine with the bundled plugin.
 */
export function setupPrompt({
	environmentName,
	environmentId,
	url,
}: {
	environmentName: string;
	environmentId: string;
	url: string;
}): string {
	return `/superset:environment Set up cloud environment ${environmentName} (${environmentId}): ${url}`;
}
