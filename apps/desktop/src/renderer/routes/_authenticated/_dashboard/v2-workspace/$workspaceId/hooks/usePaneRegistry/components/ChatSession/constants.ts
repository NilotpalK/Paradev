import { ChatCodeBlock } from "./components/ChatCodeBlock";
import { ChatInlineCode } from "./components/ChatInlineCode";
import { ChatLink } from "./components/ChatLink";
import { remarkLocalPathLinks } from "./utils/remarkLocalPathLinks";

/** The transcript and the composer share one column so their edges line up. */
export const CHAT_GUTTER_CLASSNAME =
	"pl-6 pr-[calc(1.5rem+var(--pane-aside-inset,0px))]";
/** The same gutter for a scroller, less the space it reserves for scrollbars. */
export const CHAT_SCROLLER_GUTTER_CLASSNAME =
	"pl-[max(0px,calc(1.5rem-var(--scrollbar-gutter,0px)))] pr-[calc(max(0px,calc(1.5rem-var(--scrollbar-gutter,0px)))+var(--pane-aside-inset,0px))]";
export const CHAT_COLUMN_CLASSNAME = "mx-auto w-full max-w-3xl";

export const CHAT_MARKDOWN_COMPONENTS = {
	code: ChatCodeBlock,
	inlineCode: ChatInlineCode,
	a: ChatLink,
};

export const CHAT_REMARK_PLUGINS = [remarkLocalPathLinks];
