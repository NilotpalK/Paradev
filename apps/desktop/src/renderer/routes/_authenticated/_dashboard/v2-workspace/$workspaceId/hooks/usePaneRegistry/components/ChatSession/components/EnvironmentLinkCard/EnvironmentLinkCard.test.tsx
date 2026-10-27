import { afterEach, describe, expect, mock, test } from "bun:test";
import type { AppRouter } from "@superset/trpc";
import type { TRPCLink } from "@trpc/client";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { QueryClient } = await import("@tanstack/react-query");
const { TRPCClientError } = await import("@trpc/client");
const { observable } = await import("@trpc/server/observable");
const { cleanup, fireEvent, render, waitFor } = await import(
	"@testing-library/react"
);
const { cloudTrpc } = await import("renderer/lib/cloud-trpc");
const { ChatPaneActionsProvider } = await import(
	"../../providers/ChatPaneActionsProvider"
);
type OpenAppLink =
	import("../../providers/ChatPaneActionsProvider").OpenAppLink;
const { EnvironmentLinkCard } = await import("./EnvironmentLinkCard");

afterEach(cleanup);
const URL_ = "https://app.superset.sh/environments/env-1";

const environment = {
	id: "env-1",
	name: "superset",
	scope: "personal",
	sourceKind: "image",
	repositories: [
		{ id: "r1", fullName: "superset-sh/superset" },
		{ id: "r2", fullName: "superset-sh/coding-agent" },
	],
	projectIds: [],
};

function renderCard(
	answers: Record<string, () => unknown>,
	actions: { openAppLink?: OpenAppLink } = { openAppLink: () => {} },
) {
	const asked: string[] = [];
	const link: TRPCLink<AppRouter> = () => (call) =>
		observable((observer) => {
			asked.push(call.op.path);
			try {
				const answer = answers[call.op.path];
				if (!answer) throw new Error(`unexpected ${call.op.path}`);
				observer.next({ result: { data: answer() } });
				observer.complete();
			} catch (error) {
				observer.error(TRPCClientError.from(error as Error));
			}
		});
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const view = render(
		<cloudTrpc.Provider
			client={cloudTrpc.createClient({ links: [link] })}
			queryClient={queryClient}
		>
			<ChatPaneActionsProvider openAppLink={actions.openAppLink}>
				<EnvironmentLinkCard environmentId="env-1" url={URL_} />
			</ChatPaneActionsProvider>
		</cloudTrpc.Provider>,
	);
	const settled = () =>
		waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
			expect(asked.length).toBeGreaterThan(0);
		});
	return { asked, settled, view };
}

describe("EnvironmentLinkCard", () => {
	test("shows the environment and opens it on click", async () => {
		const openAppLink = mock<OpenAppLink>(() => {});
		const { view } = renderCard(
			{
				"environment.get": () => environment,
				"environment.secrets.list": () => [{ id: "s1", key: "A" }],
			},
			{ openAppLink },
		);
		const card = await view.findByRole("button");
		expect(card.textContent).toContain("superset");
		expect(card.textContent).toContain(
			"superset-sh/superset · superset-sh/coding-agent",
		);
		fireEvent.click(card);
		expect(openAppLink).toHaveBeenCalledTimes(1);
		expect(openAppLink.mock.calls[0]?.[0]).toBe(URL_);
	});

	test("renders nothing for an environment the reader cannot see", async () => {
		const { settled, view } = renderCard({
			"environment.get": () => {
				throw new Error("Environment not found");
			},
			"environment.secrets.list": () => [],
		});
		await settled();
		expect(view.container.innerHTML).toBe("");
	});

	test("asks for nothing where the chat cannot open it", async () => {
		const { asked, view } = renderCard({}, {});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(asked).toEqual([]);
		expect(view.container.innerHTML).toBe("");
	});
});
