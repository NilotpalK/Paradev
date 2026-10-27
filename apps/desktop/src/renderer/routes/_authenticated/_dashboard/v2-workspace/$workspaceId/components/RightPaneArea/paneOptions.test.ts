import { describe, expect, test } from "bun:test";
import { getRightPaneOptions } from "./paneOptions";

describe("getRightPaneOptions", () => {
	test("does not offer the review pane", () => {
		expect(
			getRightPaneOptions({ sandbox: true, mobilePane: true }).map(
				(option) => option.kind,
			),
		).not.toContain("review");
	});

	test("offers desktop only on a sandbox and mobile only with its flag", () => {
		const kinds = (sandbox: boolean, mobilePane: boolean) =>
			getRightPaneOptions({ sandbox, mobilePane }).map((option) => option.kind);

		expect(kinds(true, true)).toEqual([
			"files",
			"diff",
			"pages-list",
			"browser",
			"desktop",
			"mobile",
			"terminal",
		]);
		expect(kinds(false, true)).not.toContain("desktop");
		expect(kinds(true, false)).not.toContain("mobile");
	});
});
