import { describe, expect, it } from "bun:test";
import { setupPrompt } from "./setupPrompt";

describe("setupPrompt", () => {
	it("runs the environment skill on the new environment", () => {
		expect(
			setupPrompt({
				environmentName: "web",
				environmentId: "e1",
				url: "https://app.superset.sh/environments/e1",
			}),
		).toBe(
			"/superset:environment Set up cloud environment web (e1): https://app.superset.sh/environments/e1",
		);
	});
});
