"use client";

import type * as React from "react";
import { safeExternalHref } from "@/lib/safe-external-url";

type Props = Omit<React.ComponentProps<"a">, "href"> & {
	href: string | null | undefined;
};

export function SafeExternalLink({ href, rel, target, ...props }: Props) {
	const safeHref = safeExternalHref(href);
	if (!safeHref) return null;

	return (
		<a
			{...props}
			href={safeHref}
			target={target ?? "_blank"}
			rel={rel ?? "noreferrer noopener"}
		/>
	);
}
