import type { LexicalEditor } from "lexical";

// App hotkeys listen on the document and would preventDefault Cmd/Ctrl+Arrow
// line moves. Alt chords still bubble: they hold previous/next tab.
function isLineNavigationChord(event: KeyboardEvent): boolean {
	return (
		(event.key === "ArrowLeft" || event.key === "ArrowRight") &&
		(event.metaKey || event.ctrlKey) &&
		!event.altKey
	);
}

export function keepLineNavigationInEditor(editor: LexicalEditor): () => void {
	const onKeyDown = (event: KeyboardEvent) => {
		if (isLineNavigationChord(event)) event.stopPropagation();
	};
	return editor.registerRootListener((root, previousRoot) => {
		previousRoot?.removeEventListener("keydown", onKeyDown);
		root?.addEventListener("keydown", onKeyDown);
	});
}
