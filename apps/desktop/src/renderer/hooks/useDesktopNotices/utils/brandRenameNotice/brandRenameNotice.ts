import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { formatCurrency } from "@superset/i18n/format";
import { BRAND } from "@superset/shared/brand";
import { COMPANY } from "@superset/shared/constants";
import type { DesktopNotice } from "@superset/shared/desktop-notices";

export const BRAND_RENAME_NOTICE_ID = `brand-rename-${BRAND.NAME}`;

const ANNOUNCEMENT_URL = `${COMPANY.MARKETING_URL}/blog/superset-is-now-paradev`;
const SEED_AMOUNT_USD = 11_500_000;

interface BrandRenameNoticeContext {
	name: string;
	formerName: string;
	previousVersion: string | null;
	isDismissed: (id: string) => boolean;
}

export function shouldShowBrandRenameNotice({
	name,
	formerName,
	previousVersion,
	isDismissed,
}: BrandRenameNoticeContext): boolean {
	return (
		name !== formerName &&
		previousVersion !== null &&
		!isDismissed(BRAND_RENAME_NOTICE_ID)
	);
}

export function createBrandRenameNotice(): DesktopNotice {
	const productName = BRAND.NAME;
	const formerName = BRAND.FORMER_NAME;
	const amount = formatCurrency(SEED_AMOUNT_USD, "USD", {
		notation: "compact",
		maximumFractionDigits: 1,
	});
	const title = i18n._(msg({ message: `${formerName} is now ${productName}` }));
	const body = i18n._(
		msg({
			message:
				"Same app, same account, same workspaces. You do not need to do anything.",
		}),
	);
	const seed = i18n._(
		msg({ message: `We also raised a ${amount} seed round, led by USV.` }),
	);
	return {
		id: BRAND_RENAME_NOTICE_ID,
		severity: "info",
		trigger: "immediate",
		body: `### ${title}\n\n${body}\n\n${seed}`,
		cta: {
			label: i18n._(msg({ message: "Read the announcement" })),
			action: "open-url",
			url: ANNOUNCEMENT_URL,
		},
		dismissible: true,
	};
}
