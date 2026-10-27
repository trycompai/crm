"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@crm/ui/components/avatar";
import { GeneratedAvatar } from "@crm/ui/components/generated-avatar";
import type * as React from "react";

export type PersonAvatarSize = "sm" | "default" | "lg";

export function PersonAvatar({
	src,
	name,
	email,
	size = "default",
	...props
}: Omit<React.ComponentProps<typeof Avatar>, "children" | "size"> & {
	src?: string | null;
	name?: string | null;
	email?: string | null;
	size?: PersonAvatarSize;
}) {
	const url = src?.trim() ? src : undefined;
	const seed = email?.trim() || name?.trim() || "";

	return (
		<Avatar size={size} {...props}>
			{url ? <AvatarImage src={url} alt="" /> : null}
			<AvatarFallback>
				<GeneratedAvatar seed={seed} size="fill" />
			</AvatarFallback>
		</Avatar>
	);
}
