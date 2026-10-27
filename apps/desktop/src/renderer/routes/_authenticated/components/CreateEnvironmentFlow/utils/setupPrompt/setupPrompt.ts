/**
 * The setup session's first message: what to set up, then the whole
 * superset:environment skill, since an agent only has the skill when the
 * superset plugin is installed and current on this machine.
 */
export function setupPrompt({
	environmentName,
	environmentId,
	url,
	skill,
}: {
	environmentName: string;
	environmentId: string;
	url: string;
	skill: string;
}): string {
	const body = skill.replace(/^---\n[\s\S]*?\n---\n+/, "").trim();
	return `Set up cloud environment ${environmentName} (${environmentId}): ${url}

Follow the superset:environment skill below.

${body}`;
}
