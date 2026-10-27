import { create } from "zustand";

export const FINISHED_LIMIT = 20;

export type FinishedSubagent = {
	key: string;
	name: string;
	terminalId: string;
	taskId: string;
	sessionId?: string;
};

const NO_FINISHED: readonly FinishedSubagent[] = [];

interface ActivityPanelStore {
	pinned: Record<string, true>;
	finished: Record<string, readonly FinishedSubagent[]>;
	asideNodes: Record<string, HTMLElement>;
	setAsideNode: (workspaceId: string, node: HTMLElement) => void;
	clearAsideNode: (workspaceId: string, node: HTMLElement) => void;
	togglePinned: (workspaceId: string) => void;
	recordFinished: (
		workspaceId: string,
		entries: readonly FinishedSubagent[],
	) => void;
}

export const useActivityPanelStore = create<ActivityPanelStore>()((set) => ({
	pinned: {},
	finished: {},
	asideNodes: {},
	setAsideNode: (workspaceId, node) =>
		set((state) =>
			state.asideNodes[workspaceId] === node
				? state
				: { asideNodes: { ...state.asideNodes, [workspaceId]: node } },
		),
	clearAsideNode: (workspaceId, node) =>
		set((state) => {
			if (state.asideNodes[workspaceId] !== node) return state;
			const { [workspaceId]: _cleared, ...asideNodes } = state.asideNodes;
			return { asideNodes };
		}),
	togglePinned: (workspaceId) =>
		set((state) => {
			const { [workspaceId]: wasPinned, ...rest } = state.pinned;
			return { pinned: wasPinned ? rest : { ...rest, [workspaceId]: true } };
		}),
	recordFinished: (workspaceId, entries) =>
		set((state) => {
			if (entries.length === 0) return state;
			const keys = new Set(entries.map((entry) => entry.key));
			const kept = (state.finished[workspaceId] ?? NO_FINISHED).filter(
				(entry) => !keys.has(entry.key),
			);
			return {
				finished: {
					...state.finished,
					[workspaceId]: [...entries, ...kept].slice(0, FINISHED_LIMIT),
				},
			};
		}),
}));

export const useFinishedSubagents = (workspaceId: string) =>
	useActivityPanelStore((state) => state.finished[workspaceId] ?? NO_FINISHED);
