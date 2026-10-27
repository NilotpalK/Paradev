import { describe, expect, it } from "bun:test";
import { setupPrompt } from "./setupPrompt";

describe("setupPrompt", () => {
	it("names the environment and inlines the skill without its frontmatter", () => {
		const prompt = setupPrompt({
			environmentName: "web",
			environmentId: "e1",
			url: "https://app.superset.sh/environments/e1",
			skill:
				"---\nname: environment\ndescription: x\n---\n\n# Cloud environment setup\n\nStep one.",
		});
		expect(prompt).toStartWith(
			"Set up cloud environment web (e1): https://app.superset.sh/environments/e1",
		);
		expect(prompt).toContain("superset:environment");
		expect(prompt).toEndWith("# Cloud environment setup\n\nStep one.");
		expect(prompt).not.toContain("description: x");
	});
});
