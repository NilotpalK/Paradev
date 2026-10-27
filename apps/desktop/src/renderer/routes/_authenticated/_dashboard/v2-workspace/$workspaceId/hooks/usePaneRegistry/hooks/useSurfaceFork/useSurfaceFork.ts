import { useLingui } from "@lingui/react/macro";
import { acpHarnessForPreset } from "@superset/chat/core";
import { errorMessage } from "@superset/i18n/errors";
import type { CreatePaneInput, RendererContext } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import { useTerminalAppearance } from "renderer/hooks/useTerminalAppearance";
import { terminalQueryColors } from "renderer/lib/terminal/terminal-query-colors";
import type {
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../../../types";
import { markChatSessionClosed } from "../../../../utils/closedChatSessions";
import { useChatWiring } from "../../components/ChatSession/hooks/useSessionClient";

export type SurfaceForkSource =
	| { into: "chat"; presetId: string; harnessSessionId: string }
	| { into: "cli"; configId: string; harnessSessionId: string };

export type ForkIntoOtherSurface = (
	ctx: RendererContext<PaneViewerData>,
	source: SurfaceForkSource,
) => Promise<void>;

export function useSurfaceFork(workspaceId: string): ForkIntoOtherSurface {
	const { t } = useLingui();
	const { transport } = useChatWiring();
	const { mutateAsync: runAgent } = workspaceTrpc.agents.run.useMutation();
	const appearance = useTerminalAppearance();

	const forkIntoChat = useCallback(
		async (presetId: string, harnessSessionId: string) => {
			const harness = acpHarnessForPreset(presetId);
			if (!harness) return null;
			// The host forks only a live chat, so the terminal's session is first
			// loaded into a hidden one. It needs its own terminal id (the CLI's would
			// rebind that terminal's agent) and the closed mark keeps auto-adopt off it.
			const loader = await transport.createSession({
				commandId: crypto.randomUUID(),
				workspaceId,
				harness,
				terminalId: crypto.randomUUID(),
				resume: { harnessSessionId },
			});
			markChatSessionClosed(loader.sessionId);
			try {
				const terminalId = crypto.randomUUID();
				const forked = await transport.forkSession({
					commandId: crypto.randomUUID(),
					sessionId: loader.sessionId,
					workspaceId,
					terminalId,
				});
				return forked ? { terminalId, sessionId: forked.sessionId } : null;
			} finally {
				void transport
					.closeSession({ sessionId: loader.sessionId })
					.catch(() => undefined);
			}
		},
		[transport, workspaceId],
	);

	return useCallback<ForkIntoOtherSurface>(
		async (ctx, source) => {
			const splitBeside = (newPane: CreatePaneInput<PaneViewerData>) =>
				ctx.store.getState().splitPane({
					tabId: ctx.tab.id,
					paneId: ctx.pane.id,
					position: "right",
					newPane,
				});

			if (source.into === "cli") {
				try {
					const result = await runAgent({
						workspaceId,
						colors: terminalQueryColors(appearance.theme),
						agent: source.configId,
						prompt: "",
						forkSessionId: source.harnessSessionId,
					});
					if (result.kind !== "terminal") {
						toast.error(t({ message: "Couldn't fork into a terminal" }));
						return;
					}
					splitBeside({
						kind: "terminal",
						titleOverride: result.label,
						data: { terminalId: result.sessionId } satisfies TerminalPaneData,
					});
				} catch (error) {
					toast.error(t({ message: "Couldn't fork into a terminal" }), {
						description: errorMessage(error, t({ message: "Unknown error" })),
					});
				}
				return;
			}

			const toastId = toast.loading(t({ message: "Forking into a chat…" }));
			try {
				const forked = await forkIntoChat(
					source.presetId,
					source.harnessSessionId,
				);
				if (!forked) {
					toast.error(
						t({ message: "This agent can't branch a conversation" }),
						{
							id: toastId,
						},
					);
					return;
				}
				toast.dismiss(toastId);
				splitBeside({
					kind: "chat-v3",
					...(ctx.pane.titleOverride
						? { titleOverride: ctx.pane.titleOverride }
						: {}),
					data: {
						terminalId: forked.terminalId,
						sessionId: forked.sessionId,
						agent: { id: source.presetId },
					} satisfies ChatPaneData,
				});
			} catch (error) {
				toast.error(t({ message: "Couldn't fork into a chat" }), {
					id: toastId,
					description: errorMessage(error, t({ message: "Unknown error" })),
				});
			}
		},
		[forkIntoChat, runAgent, workspaceId, appearance.theme, t],
	);
}
