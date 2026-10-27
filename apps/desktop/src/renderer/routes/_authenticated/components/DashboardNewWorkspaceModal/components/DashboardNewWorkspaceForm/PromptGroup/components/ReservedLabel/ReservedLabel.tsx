import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

interface ReservedLabelProps {
	children: ReactNode;
	/** Labels the slot is always wide enough for; the widest sets the width. */
	reserve: readonly string[];
	/** Centered with the text, e.g. the picker's icon. */
	leading?: ReactNode;
	leadingClassName?: "size-3" | "size-4";
	/** Pinned to the end, e.g. the picker's chevron; reserved as `size-3`. */
	trailing?: ReactNode;
	className?: string;
}

/**
 * A label whose width is set by `reserve`, never by what it shows, so a
 * picker keeps its size while it loads or changes value. Longer text
 * truncates. The shown row has `w-0 min-w-full`, so it adds nothing to the
 * grid's width and then fills it.
 */
export function ReservedLabel({
	children,
	reserve,
	leading,
	leadingClassName = "size-4",
	trailing,
	className,
}: ReservedLabelProps) {
	return (
		<span className={cn("inline-grid min-w-0", className)}>
			{reserve.map((label) => (
				<span
					aria-hidden
					className="invisible col-start-1 row-start-1 flex items-center gap-1 whitespace-nowrap"
					key={label}
				>
					{leading && <span className={cn("shrink-0", leadingClassName)} />}
					{label}
					{trailing && <span className="size-3 shrink-0" />}
				</span>
			))}
			<span className="col-start-1 row-start-1 flex w-0 min-w-full items-center gap-1">
				<span className="flex min-w-0 flex-1 items-center justify-center gap-1">
					{leading}
					<span className="min-w-0 truncate">{children}</span>
				</span>
				{trailing}
			</span>
		</span>
	);
}
