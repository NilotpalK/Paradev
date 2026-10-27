import { create } from "zustand";

export const useDismissedLimitWarnings = create<{
	keys: ReadonlySet<string>;
	dismiss: (key: string) => void;
}>()((set) => ({
	keys: new Set(),
	dismiss: (key) => set((state) => ({ keys: new Set(state.keys).add(key) })),
}));
