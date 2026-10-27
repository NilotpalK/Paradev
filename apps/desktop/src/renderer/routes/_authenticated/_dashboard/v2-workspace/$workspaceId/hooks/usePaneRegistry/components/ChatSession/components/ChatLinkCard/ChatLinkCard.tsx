import type { PageLink } from "../../utils/pageLinks";
import { EnvironmentLinkCard } from "../EnvironmentLinkCard";
import { PageLinkCard } from "../PageLinkCard";

export function ChatLinkCard({
	link,
	className,
}: {
	link: PageLink;
	className?: string;
}) {
	return link.environmentId ? (
		<EnvironmentLinkCard
			className={className}
			environmentId={link.environmentId}
			url={link.url}
		/>
	) : (
		<PageLinkCard className={className} slug={link.slug} url={link.url} />
	);
}
