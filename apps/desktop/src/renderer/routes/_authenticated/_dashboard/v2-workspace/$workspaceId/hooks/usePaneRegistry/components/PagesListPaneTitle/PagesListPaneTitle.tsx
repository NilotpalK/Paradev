import { useLingui } from "@lingui/react/macro";
import { ChevronLeft } from "lucide-react";
import type { PagePaneData } from "../../../../types";
import { PagePaneTitle } from "../PagePaneTitle";

interface PagesListPaneTitleProps {
	page: PagePaneData;
	pageUiId: string;
	onBack: () => void;
}

export function PagesListPaneTitle({
	page,
	pageUiId,
	onBack,
}: PagesListPaneTitleProps) {
	const { t } = useLingui();
	return (
		<span className="flex min-w-0 items-center gap-0.5">
			<button
				type="button"
				aria-label={t({ message: "Back to pages" })}
				title={t({ message: "Back to pages" })}
				onClick={(event) => {
					event.stopPropagation();
					onBack();
				}}
				className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent"
			>
				<ChevronLeft className="size-3.5" />
			</button>
			<PagePaneTitle data={page} paneId={pageUiId} onClose={onBack} />
		</span>
	);
}
