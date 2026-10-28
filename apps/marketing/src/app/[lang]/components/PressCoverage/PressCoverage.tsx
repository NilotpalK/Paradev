import type { SupportedLocale } from "@superset/i18n";
import { FeaturedPressRow } from "./components/FeaturedPressRow";
import { PressRow } from "./components/PressRow";
import { PRESS_ARTICLES } from "./constants";

interface PressCoverageProps {
	lang: SupportedLocale;
	/** `featured` shows only the highlighted articles; `all` lists the rest below them. */
	variant: "featured" | "all";
}

export function PressCoverage({ lang, variant }: PressCoverageProps) {
	const featured = PRESS_ARTICLES.filter((article) => article.featured);
	const rest = PRESS_ARTICLES.filter((article) => !article.featured);

	return (
		<ul className="divide-y divide-border">
			{featured.map((article) => (
				<li key={article.url}>
					<FeaturedPressRow article={article} lang={lang} />
				</li>
			))}
			{variant === "all" &&
				rest.map((article) => (
					<li key={article.url}>
						<PressRow article={article} lang={lang} />
					</li>
				))}
		</ul>
	);
}
