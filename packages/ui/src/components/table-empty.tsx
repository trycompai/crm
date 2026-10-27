import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Spinner } from "@crm/ui/components/spinner";
import type { ReactNode } from "react";

export function TableEmpty({
	title,
	description,
	action,
	busy = false,
}: {
	title: string;
	description: string;
	action?: ReactNode;
	busy?: boolean;
}) {
	return (
		<Empty aria-busy={busy || undefined}>
			<EmptyHeader>
				{busy ? (
					<EmptyMedia>
						<Spinner />
					</EmptyMedia>
				) : null}
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
			{action ? <EmptyContent>{action}</EmptyContent> : null}
		</Empty>
	);
}
