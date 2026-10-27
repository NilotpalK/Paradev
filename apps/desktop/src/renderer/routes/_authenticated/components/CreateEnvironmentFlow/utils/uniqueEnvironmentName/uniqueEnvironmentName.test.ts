import { expect, test } from "bun:test";
import { uniqueEnvironmentName } from "./uniqueEnvironmentName";

test("keeps a free name", () => {
	expect(uniqueEnvironmentName("web", ["api"])).toBe("web");
});

test("numbers a taken name, ignoring case", () => {
	expect(uniqueEnvironmentName("web", ["Web", "web-2"])).toBe("web-3");
});
