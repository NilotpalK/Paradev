import { afterAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();

type LexicalEditor = import("lexical").LexicalEditor;
type RootListener = Parameters<LexicalEditor["registerRootListener"]>[0];
const { keepLineNavigationInEditor } = await import(
	"./keepLineNavigationInEditor"
);

afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function reachesDocument(init: KeyboardEventInit): boolean {
	const root = document.createElement("div");
	root.contentEditable = "true";
	document.body.append(root);
	const editor = {
		registerRootListener: (listener: RootListener) => {
			listener(root, null);
			return () => listener(null, root);
		},
	} as unknown as LexicalEditor;
	const unregister = keepLineNavigationInEditor(editor);
	let reached = false;
	const onKeyDown = () => {
		reached = true;
	};
	document.addEventListener("keydown", onKeyDown);
	root.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
	document.removeEventListener("keydown", onKeyDown);
	unregister();
	root.remove();
	return reached;
}

describe("keepLineNavigationInEditor", () => {
	test("keeps Cmd/Ctrl+Left/Right in the editor", () => {
		expect(reachesDocument({ key: "ArrowLeft", metaKey: true })).toBe(false);
		expect(reachesDocument({ key: "ArrowRight", metaKey: true })).toBe(false);
		expect(
			reachesDocument({ key: "ArrowRight", metaKey: true, shiftKey: true }),
		).toBe(false);
		expect(reachesDocument({ key: "ArrowLeft", ctrlKey: true })).toBe(false);
	});

	test("lets other chords reach app hotkeys", () => {
		expect(
			reachesDocument({ key: "ArrowLeft", metaKey: true, altKey: true }),
		).toBe(true);
		expect(reachesDocument({ key: "ArrowLeft" })).toBe(true);
		expect(reachesDocument({ key: "k", metaKey: true })).toBe(true);
	});
});
