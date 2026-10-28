import { Trans } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { FaGithub } from "react-icons/fa";
import {
	HiCheck,
	HiChevronUpDown,
	HiMiniPlus,
	HiOutlineArrowTopRightOnSquare,
} from "react-icons/hi2";
import { FORM_PICKER_MENU_CLASS } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/components/FormPickerTrigger";
import type { GitHubInstallationOption } from "../../types";

interface RepositorySourcePickerProps {
	installations: readonly GitHubInstallationOption[];
	selectedId: string | null;
	onSelect: (installationId: string | null) => void;
	onConnectOrg: () => void;
}

export function RepositorySourcePicker({
	installations,
	selectedId,
	onSelect,
	onConnectOrg,
}: RepositorySourcePickerProps) {
	const selected = installations.find(
		(installation) => installation.id === selectedId,
	);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					className="inline-flex h-[22px] min-w-0 items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground data-[state=open]:text-foreground"
					type="button"
				>
					<span className="truncate">
						{selected ? selected.accountLogin : <Trans>All repositories</Trans>}
					</span>
					<HiChevronUpDown className="size-3 shrink-0" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className={`w-56 ${FORM_PICKER_MENU_CLASS}`}
			>
				<DropdownMenuItem onSelect={() => onSelect(null)}>
					<span className="flex-1">
						<Trans>All repositories</Trans>
					</span>
					{selectedId === null && <HiCheck className="size-4" />}
				</DropdownMenuItem>
				{installations.map((installation) => (
					<DropdownMenuItem
						key={installation.id}
						onSelect={() => onSelect(installation.id)}
					>
						<FaGithub className="size-4" />
						<span className="flex-1 truncate">{installation.accountLogin}</span>
						{selectedId === installation.id && <HiCheck className="size-4" />}
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={onConnectOrg}>
					<HiMiniPlus className="size-4" />
					<span className="flex-1">
						<Trans>Connect GitHub org</Trans>
					</span>
					<HiOutlineArrowTopRightOnSquare className="size-3.5" />
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
