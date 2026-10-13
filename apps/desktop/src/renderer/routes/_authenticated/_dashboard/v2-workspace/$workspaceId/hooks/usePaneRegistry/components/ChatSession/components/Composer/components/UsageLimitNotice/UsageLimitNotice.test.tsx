import { afterEach, expect, mock, test } from "bun:test";
import type { UsageLimitAction } from "@superset/chat/protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { UsageLimitNotice } from "./UsageLimitNotice";

afterEach(cleanup);

const HOUR_MS = 60 * 60 * 1000;

function renderNotice(props: ComponentProps<typeof UsageLimitNotice>) {
	return render(
		<QueryClientProvider client={new QueryClient()}>
			<UsageLimitNotice {...props} />
		</QueryClientProvider>,
	);
}

test("while the window is closed it names the limit and model and offers to resume at the reset", () => {
	const onRespond = mock<(action: UsageLimitAction) => void>();
	const view = renderNotice({
		limit: {
			hitAtMs: Date.now(),
			resetsAtMs: Date.now() + 2 * HOUR_MS,
			window: "five_hour",
			model: "claude-sonnet-5-5",
		},
		modelLabel: "Sonnet 5.5",
		onRespond,
	});
	const text = view.container.textContent ?? "";
	expect(text).toContain("5-hour limit reached");
	expect(text).toContain("Sonnet 5.5 · Resets in 2h");
	fireEvent.click(view.getByText("Resume at reset"));
	expect(onRespond.mock.calls).toEqual([["resume_at_reset"]]);
});

test("an armed resume can be cancelled", () => {
	const onRespond = mock<(action: UsageLimitAction) => void>();
	const view = renderNotice({
		limit: {
			hitAtMs: Date.now(),
			resetsAtMs: Date.now() + HOUR_MS,
			resumeAtReset: true,
		},
		onRespond,
	});
	fireEvent.click(view.getByText("Resuming at reset"));
	expect(onRespond.mock.calls).toEqual([["cancel_resume_at_reset"]]);
});

test("once the window is open, or when no reset is known, it offers to resume now", () => {
	const onRespond = mock<(action: UsageLimitAction) => void>();
	const view = renderNotice({
		limit: { hitAtMs: Date.now() - HOUR_MS, resetsAtMs: Date.now() - 1 },
		onRespond,
	});
	expect(view.container.textContent).toContain("Limit has reset");
	fireEvent.click(view.getByText("Resume"));
	fireEvent.click(view.getByLabelText("Dismiss the usage limit notice"));
	expect(onRespond.mock.calls).toEqual([["resume"], ["dismiss"]]);

	cleanup();
	const bare = renderNotice({ limit: { hitAtMs: Date.now() }, onRespond });
	expect(bare.container.textContent).not.toContain("Resets");
	expect(bare.getByText("Resume")).toBeTruthy();
});

test("the account menu is only for agents whose logins the host can switch", () => {
	const plain = renderNotice({
		limit: { hitAtMs: Date.now() },
		onRespond: () => undefined,
	});
	expect(plain.queryByText("Account")).toBeNull();
	cleanup();
	const claude = renderNotice({
		limit: { hitAtMs: Date.now() },
		onRespond: () => undefined,
		agent: "claude",
		hostUrl: null,
	});
	expect(claude.getByText("Account")).toBeTruthy();
});
