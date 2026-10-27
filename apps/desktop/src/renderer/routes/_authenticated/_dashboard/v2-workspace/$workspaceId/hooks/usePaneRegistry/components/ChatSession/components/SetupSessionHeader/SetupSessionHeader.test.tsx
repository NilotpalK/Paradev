import { afterEach, describe, expect, mock, test } from "bun:test";
import type { AppRouter } from "@superset/trpc";
import type { TRPCLink } from "@trpc/client";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { QueryClient } = await import("@tanstack/react-query");
const { observable } = await import("@trpc/server/observable");
const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { cloudTrpc } = await import("renderer/lib/cloud-trpc");
const { ChatPaneActionsProvider } = await import(
	"../../providers/ChatPaneActionsProvider"
);
type OpenAppLink =
	import("../../providers/ChatPaneActionsProvider").OpenAppLink;
const { SetupSessionHeader } = await import("./SetupSessionHeader");

afterEach(cleanup);
const URL_ = "https://app.superset.sh/environments/env-1";

describe("SetupSessionHeader", () => {
	test("names the environment and opens it from Edit environment", async () => {
		const link: TRPCLink<AppRouter> = () => () =>
			observable((observer) => {
				observer.next({ result: { data: { id: "env-1", name: "superset" } } });
				observer.complete();
			});
		const openAppLink = mock<OpenAppLink>(() => {});
		const view = render(
			<cloudTrpc.Provider
				client={cloudTrpc.createClient({ links: [link] })}
				queryClient={new QueryClient()}
			>
				<ChatPaneActionsProvider openAppLink={openAppLink}>
					<SetupSessionHeader environmentId="env-1" url={URL_} />
				</ChatPaneActionsProvider>
			</cloudTrpc.Provider>,
		);
		expect(view.container.textContent).toContain("Cloud environment setup");
		await view.findByText("superset");
		fireEvent.click(view.getByRole("button"));
		expect(openAppLink.mock.calls[0]?.[0]).toBe(URL_);
	});
});
