import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";

export type Owner = {
	id: string;
	name: string;
	email: string;
	image: string | null;
};

export function OwnerCell({
	owner,
	compact = false,
}: {
	owner: Owner | null;
	compact?: boolean;
}) {
	if (!owner) return compact ? null : <EmptyCellValue />;

	const avatar = (
		<PersonAvatar
			src={owner.image}
			name={owner.name}
			email={owner.email}
			size="sm"
		/>
	);

	if (compact) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span>{avatar}</span>
				</TooltipTrigger>
				<TooltipContent>{owner.name}</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<span className="flex min-w-0 items-center gap-2">
			{avatar}
			<span className="truncate">{owner.name}</span>
		</span>
	);
}
