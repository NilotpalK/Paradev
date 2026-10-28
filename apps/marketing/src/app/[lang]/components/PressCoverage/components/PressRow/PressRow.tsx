import type { SupportedLocale } from "@superset/i18n";
import { formatDate } from "@superset/i18n/format";
import Image from "next/image";
import { PRESS_DATE_FORMAT, type PressArticle } from "../../constants";

interface PressRowProps {
	article: PressArticle;
	lang: SupportedLocale;
}

export function PressRow({ article, lang }: PressRowProps) {
	return (
		<a
			href={article.url}
			target="_blank"
			rel="noopener noreferrer"
			className="group flex items-start gap-3 py-4"
		>
			<Image
				src={article.icon}
				alt=""
				width={16}
				height={16}
				className="mt-1 size-4 shrink-0 rounded-sm"
			/>
			<div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-6">
				<p
					lang={article.titleLang}
					className="text-foreground leading-snug underline-offset-4 group-hover:underline sm:flex-1"
				>
					{article.title}
				</p>
				<p className="mt-1 shrink-0 font-mono text-muted-foreground text-xs sm:mt-0">
					{article.outlet} ·{" "}
					<time dateTime={article.date}>
						{formatDate(
							new Date(`${article.date}T00:00:00Z`),
							PRESS_DATE_FORMAT,
							lang,
						)}
					</time>
				</p>
			</div>
		</a>
	);
}
