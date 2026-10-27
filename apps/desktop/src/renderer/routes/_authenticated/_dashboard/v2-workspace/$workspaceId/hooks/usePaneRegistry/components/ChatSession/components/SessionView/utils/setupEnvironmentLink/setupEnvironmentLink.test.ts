import { describe, expect, it } from "bun:test";
import { pageLinkFinder } from "../../../../utils/pageLinks";
import { setupEnvironmentLink } from "./setupEnvironmentLink";

const WEB = "https://app.superset.sh";
const find = pageLinkFinder(WEB);

describe("setupEnvironmentLink", () => {
	it("finds the environment a setup prompt links", () => {
		const prompt = `Use the superset:environment skill to set up cloud environment api (e1): ${WEB}/environments/e1`;
		expect(setupEnvironmentLink(prompt, find)?.environmentId).toBe("e1");
	});

	it("ignores an environment link in an ordinary first message", () => {
		expect(
			setupEnvironmentLink(`What is in ${WEB}/environments/e1?`, find),
		).toBe(null);
		expect(setupEnvironmentLink(null, find)).toBe(null);
	});
});
