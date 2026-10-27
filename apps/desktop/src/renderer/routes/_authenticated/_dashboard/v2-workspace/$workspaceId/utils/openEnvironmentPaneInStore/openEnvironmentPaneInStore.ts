import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { EnvironmentPaneData, PaneViewerData } from "../../types";

export function openEnvironmentPaneInStore(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	data: EnvironmentPaneData,
	placement: "split" | "tab" = "split",
): void {
	const pane = { kind: "environment", data };
	if (placement === "tab") store.getState().addTab({ panes: [pane] });
	else store.getState().openPane({ pane });
}
