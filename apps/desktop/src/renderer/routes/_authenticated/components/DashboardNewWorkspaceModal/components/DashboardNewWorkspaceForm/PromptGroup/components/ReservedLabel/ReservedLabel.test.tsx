import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { ReservedLabel } from "./ReservedLabel";

afterEach(cleanup);

test("reserves every label but shows only the current one", () => {
	const { container } = render(
		<ReservedLabel reserve={["Select environment", "Create environment"]}>
			Router
		</ReservedLabel>,
	);
	const hidden = container.querySelectorAll("[aria-hidden]");
	expect([...hidden].map((node) => node.textContent)).toEqual([
		"Select environment",
		"Create environment",
	]);
	expect(container.textContent).toContain("Router");
	expect(container.querySelector(".truncate")?.textContent).toBe("Router");
});
