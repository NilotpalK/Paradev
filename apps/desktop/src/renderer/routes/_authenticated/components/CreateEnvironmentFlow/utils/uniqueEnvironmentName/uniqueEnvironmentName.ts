/** `name`, or the first of `name-2`, `name-3`… not already taken. */
export function uniqueEnvironmentName(
	name: string,
	taken: readonly string[],
): string {
	const lower = new Set(taken.map((existing) => existing.toLowerCase()));
	if (!lower.has(name.toLowerCase())) return name;
	for (let n = 2; ; n++) {
		const candidate = `${name}-${n}`;
		if (!lower.has(candidate.toLowerCase())) return candidate;
	}
}
