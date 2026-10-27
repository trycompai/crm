import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
} from "@crm/ui/components/field";
import { Skeleton } from "@crm/ui/components/skeleton";
import type * as React from "react";
import { useId } from "react";

function SettingRows({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex flex-col divide-y" data-slot="setting-rows">
			{children}
		</div>
	);
}

function SettingRow({
	title,
	description,
	control,
	loading = false,
	loadingControl = "switch",
}: {
	title: React.ReactNode;
	description?: React.ReactNode;
	control: (id: string, describedBy: string | undefined) => React.ReactNode;
	loading?: boolean;
	loadingControl?: "switch" | "select";
}) {
	const id = useId();
	const descriptionId = `${id}-description`;

	return (
		<Field
			className="justify-between gap-6 py-4 first:pt-0 last:pb-0"
			data-slot="setting-row"
			orientation="horizontal"
		>
			<FieldContent>
				<FieldLabel htmlFor={id}>{title}</FieldLabel>
				{description ? (
					<FieldDescription id={descriptionId}>{description}</FieldDescription>
				) : null}
			</FieldContent>
			<div className="flex shrink-0 items-center">
				{loading ? (
					<Skeleton
						className={
							loadingControl === "switch"
								? "h-4.5 w-8 rounded-full"
								: "h-8 w-40 rounded-md"
						}
					/>
				) : (
					control(id, description ? descriptionId : undefined)
				)}
			</div>
		</Field>
	);
}

export { SettingRow, SettingRows };
