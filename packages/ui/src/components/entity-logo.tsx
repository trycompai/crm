"use client";

import { isOptimizable } from "@crm/db/images";
import { initialsFromName } from "@crm/ui/lib/format";
import { cn } from "@crm/ui/lib/utils";
import Image from "next/image";
import { useState } from "react";

export type EntityLogoSize = "xs" | "sm" | "default" | "lg" | "xl";

const PX: Record<EntityLogoSize, number> = {
	xs: 16,
	sm: 20,
	default: 24,
	lg: 32,
	xl: 48,
};

export type EntityLogoTone = "opaque" | "dark" | "light";

const TONE_CLASS: Record<EntityLogoTone, string> = {
	opaque: "",
	dark: "dark:invert",
	light: "invert dark:invert-0",
};

export function EntityLogo({
	src,
	darkSrc,
	tone,
	name,
	size = "default",
	className,
}: {
	src?: string | null;
	darkSrc?: string | null;
	tone?: EntityLogoTone | null;
	name: string;
	size?: EntityLogoSize;
	className?: string;
}) {
	const [failedSrc, setFailedSrc] = useState<string | null>(null);

	const url = src?.trim() ? src : null;
	const dark = darkSrc?.trim() ? darkSrc : null;
	const showImage = url !== null && failedSrc !== url;

	const toneClass = dark ? "" : tone ? TONE_CLASS[tone] : "";

	return (
		<span
			data-slot="entity-logo"
			data-size={size}
			className={cn(
				"inline-flex size-6 shrink-0 select-none items-center justify-center overflow-hidden text-center font-medium text-[10px] text-muted-foreground uppercase leading-none",
				"data-[size=xs]:size-4 data-[size=xs]:text-[8px] data-[size=sm]:size-5 data-[size=sm]:text-[9px] data-[size=lg]:size-8 data-[size=lg]:text-xs data-[size=xl]:size-12 data-[size=xl]:text-base",
				!showImage && "bg-muted",
				className,
			)}
		>
			{showImage ? (
				<>
					<Artwork
						src={url}
						px={PX[size]}
						onError={() => setFailedSrc(url)}
						className={cn(
							"size-full object-contain",
							dark && "dark:hidden",
							toneClass,
						)}
					/>

					{dark ? (
						<Artwork
							src={dark}
							px={PX[size]}
							className="hidden size-full object-contain dark:block"
						/>
					) : null}
				</>
			) : (
				initialsFromName(name)
			)}
		</span>
	);
}

function Artwork({
	src,
	px,
	className,
	onError,
}: {
	src: string;
	px: number;
	className: string;
	onError?: () => void;
}) {
	const shared = {
		alt: "",
		loading: "lazy",
		decoding: "async",
		referrerPolicy: "no-referrer",
		onError,
		className,
	} as const;

	return (
		<Image
			src={src}
			width={px}
			height={px}
			unoptimized={!isOptimizable(src)}
			{...shared}
		/>
	);
}
