import { expect, test } from "bun:test";
import { FINISHED_LIMIT, useActivityPanelStore } from "./activityPanelStore";

const finished = (n: number) => ({
	key: `chat:${n}`,
	name: `agent ${n}`,
	terminalId: "chat",
	taskId: `${n}`,
});

test("finished subagents are newest first, deduplicated and capped", () => {
	const { recordFinished } = useActivityPanelStore.getState();
	for (let n = 0; n < FINISHED_LIMIT + 5; n++)
		recordFinished("ws-cap", [finished(n)]);
	recordFinished("ws-cap", [finished(FINISHED_LIMIT + 4)]);
	const list = useActivityPanelStore.getState().finished["ws-cap"] ?? [];
	expect(list).toHaveLength(FINISHED_LIMIT);
	expect(list[0]?.key).toBe(`chat:${FINISHED_LIMIT + 4}`);
	expect(new Set(list.map((entry) => entry.key)).size).toBe(FINISHED_LIMIT);
});

test("an aside only clears the slot it still owns", () => {
	const { setAsideNode, clearAsideNode } = useActivityPanelStore.getState();
	const first = {} as HTMLElement;
	const second = {} as HTMLElement;
	setAsideNode("ws-aside", first);
	setAsideNode("ws-aside", second);
	clearAsideNode("ws-aside", first);
	expect(useActivityPanelStore.getState().asideNodes["ws-aside"]).toBe(second);
	clearAsideNode("ws-aside", second);
	expect(
		useActivityPanelStore.getState().asideNodes["ws-aside"],
	).toBeUndefined();
});

test("pinning is per workspace", () => {
	const { togglePinned } = useActivityPanelStore.getState();
	togglePinned("ws-a");
	togglePinned("ws-b");
	togglePinned("ws-b");
	const { pinned } = useActivityPanelStore.getState();
	expect(pinned["ws-a"]).toBe(true);
	expect(pinned["ws-b"]).toBeUndefined();
});
