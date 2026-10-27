import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { EnvironmentPaneData, PaneViewerData } from "../../types";
import { focusOrOpenPane } from "../focusOrOpenPane";

export function openEnvironmentPaneInStore(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	data: EnvironmentPaneData,
	placement: "split" | "tab" = "split",
): void {
	focusOrOpenPane<EnvironmentPaneData>(
		store,
		"environment",
		(pane) => pane.environmentId === data.environmentId,
		data,
		placement,
	);
}
