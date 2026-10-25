import { Trans } from "@lingui/react/macro";
import { formatCurrency } from "@superset/i18n/format";
import { BRAND } from "@superset/shared/brand";
import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@superset/ui/dialog";
import { useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import revealFilm from "./assets/paradev-reveal.mp4";
import revealEndFrame from "./assets/paradev-reveal-end.jpg";

const ANNOUNCEMENT_URL = `${COMPANY.MARKETING_URL}/blog/superset-is-now-paradev`;
const SEED_AMOUNT_USD = 11_500_000;

interface BrandRenameDialogProps {
	onDismiss: () => void;
}

export function BrandRenameDialog({ onDismiss }: BrandRenameDialogProps) {
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const reduceMotion = useReducedMotion();
	const filmRef = useRef<HTMLVideoElement>(null);

	const formerName = BRAND.FORMER_NAME;
	const productName = BRAND.NAME;
	const amount = formatCurrency(SEED_AMOUNT_USD, "USD", {
		notation: "compact",
		maximumFractionDigits: 1,
	});

	const replayFilm = () => {
		const film = filmRef.current;
		if (!film || reduceMotion) return;
		film.currentTime = 0;
		void film.play();
	};

	const readAnnouncement = () => {
		openUrl.mutate(ANNOUNCEMENT_URL);
		onDismiss();
	};

	return (
		<Dialog open modal onOpenChange={(open) => !open && onDismiss()}>
			<DialogContent
				className="max-w-lg gap-0 overflow-hidden rounded-none p-0"
				showCloseButton={false}
			>
				<video
					ref={filmRef}
					src={revealFilm}
					poster={revealEndFrame}
					autoPlay={!reduceMotion}
					muted
					playsInline
					preload="auto"
					aria-hidden
					onClick={replayFilm}
					className="aspect-[1600/838] w-full cursor-pointer bg-[#100f0e] object-cover"
				/>
				<div className="p-5">
					<DialogTitle className="text-base font-semibold">
						<Trans>
							{formerName} is now {productName}
						</Trans>
					</DialogTitle>
					<DialogDescription className="mt-2 text-[13px]">
						<Trans>
							Same app, same account, same workspaces. You do not need to do
							anything.
						</Trans>
					</DialogDescription>
					<p className="mt-3 font-mono text-xs text-muted-foreground">
						<Trans>We also raised a {amount} seed round, led by USV.</Trans>
					</p>
					<DialogFooter className="mt-5 flex-row justify-end gap-2">
						<Button variant="ghost" size="sm" onClick={onDismiss}>
							<Trans>Got it</Trans>
						</Button>
						<Button size="sm" onClick={readAnnouncement}>
							<Trans>Read the announcement</Trans>
						</Button>
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}
