import { afterEach, expect, test } from "bun:test";
import {
	PromptInput,
	type PromptInputHandle,
} from "@superset/chat-ui/PromptInput";
import type { AppRouter } from "@superset/host-service/trpc";
import { workspaceTrpc } from "@superset/workspace-client";
import { QueryClient } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { ChatPaneActionsProvider } from "../../../../providers/ChatPaneActionsProvider";
import { useLinkChips } from "./useLinkChips";

const noAnswers: TRPCLink<AppRouter> = () => () =>
	observable((observer) => observer.complete());

afterEach(cleanup);

const handle: { current: PromptInputHandle | null } = { current: null };

function Composer() {
	const { chipForPaste, renderChip } = useLinkChips();
	return (
		<PromptInput
			chipForPaste={chipForPaste}
			commands={[]}
			defaultValue="Draft about https://github.com/acme/widgets/issues/7 here"
			mentionProviders={[]}
			ref={(instance) => {
				handle.current = instance;
			}}
			renderChip={renderChip}
		/>
	);
}

async function setup() {
	const view = render(
		<workspaceTrpc.Provider
			client={workspaceTrpc.createClient({ links: [noAnswers] })}
			queryClient={new QueryClient()}
		>
			<ChatPaneActionsProvider workspaceId="workspace-1">
				<Composer />
			</ChatPaneActionsProvider>
		</workspaceTrpc.Provider>,
	);
	const editable = view.container.querySelector(
		"[contenteditable]",
	) as HTMLElement;
	const paste = async (value: string) => {
		const data = new DataTransfer();
		data.setData("text/plain", value);
		const event = new ClipboardEvent("paste", {
			clipboardData: data,
			bubbles: true,
			cancelable: true,
		});
		await act(async () => {
			editable.focus();
			editable.dispatchEvent(event);
		});
	};
	const chips = () =>
		[...view.container.querySelectorAll("[data-mention-chip]")].map(
			(chip) => chip.textContent,
		);
	const text = () => view.container.textContent ?? "";
	const type = async (value: string) => {
		await act(async () => {
			handle.current?.appendText(value);
		});
	};
	const chipHasPopup = () => {
		const chip = view.container.querySelector("[data-mention-chip]");
		return (
			chip?.hasAttribute("data-state") ||
			chip?.closest("[data-slot=hover-card-trigger]") !== null
		);
	};
	return { paste, chips, text, type, chipHasPopup };
}

test("a pasted link becomes a named chip; other text stays text", async () => {
	const { paste, chips } = await setup();
	await paste("https://github.com/acme/widgets/pull/42");
	expect(chips()).toContain("acme/widgets#42");
	const before = chips().length;
	await paste("a sentence with no link");
	expect(chips()).toHaveLength(before);
});

test("a typed or restored link stays text", async () => {
	const { chips, text } = await setup();
	expect(chips()).toEqual([]);
	expect(text()).not.toContain("biome-ignore");
	expect(text()).not.toContain("drag-and-drop");
});

test("while the mention menu is open, a chip has no card or tooltip to cover it", async () => {
	const { paste, type, chipHasPopup } = await setup();
	await paste("https://agentclientprotocol.com/protocol/content");
	expect(chipHasPopup()).toBe(true);
	await type(" @");
	expect(chipHasPopup()).toBe(false);
});
