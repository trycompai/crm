import { Skeleton } from "@crm/ui/components/skeleton";

export const SKELETON_LINE_SIZES = ["sm", "base", "lg", "2xl"] as const;

export type SkeletonLineSize = (typeof SKELETON_LINE_SIZES)[number];

export const SKELETON_LINE_WIDTHS = [
	"24",
	"40",
	"48",
	"64",
	"72",
	"96",
	"two-thirds",
	"full",
] as const;

export type SkeletonLineWidth = (typeof SKELETON_LINE_WIDTHS)[number];

export const SKELETON_BLOCK_HEIGHTS = ["24", "40", "56"] as const;

export type SkeletonBlockHeight = (typeof SKELETON_BLOCK_HEIGHTS)[number];

const LINE_CLASS =
	"max-w-full data-[size=sm]:h-4 data-[size=base]:h-5 data-[size=lg]:h-6 data-[size=2xl]:h-8 data-[width=24]:w-24 data-[width=40]:w-40 data-[width=48]:w-48 data-[width=64]:w-64 data-[width=72]:w-72 data-[width=96]:w-96 data-[width=two-thirds]:w-2/3 data-[width=full]:w-full";

const BLOCK_CLASS =
	"w-full data-[height=24]:h-24 data-[height=40]:h-40 data-[height=56]:h-56";

function SkeletonLine({
	size = "sm",
	width = "full",
}: {
	size?: SkeletonLineSize;
	width?: SkeletonLineWidth;
}) {
	return (
		<Skeleton className={LINE_CLASS} data-size={size} data-width={width} />
	);
}

function SkeletonBlock({ height }: { height: SkeletonBlockHeight }) {
	return <Skeleton className={BLOCK_CLASS} data-height={height} />;
}

const MARK_CLASS =
	"shrink-0 data-[kind=person]:rounded-full data-[kind=workspace]:rounded-md data-[size=sm]:size-5 data-[size=md]:size-6 data-[size=lg]:size-8 data-[size=xl]:size-12";

function SkeletonMark({
	size = "md",
	kind = "person",
}: {
	size?: "sm" | "md" | "lg" | "xl";
	kind?: "person" | "workspace";
}) {
	return <Skeleton className={MARK_CLASS} data-kind={kind} data-size={size} />;
}

function SkeletonField() {
	return <Skeleton className="h-9 w-full" data-slot="field-skeleton" />;
}

export const SKELETON_CONTROL_WIDTHS = [
	"20",
	"24",
	"28",
	"32",
	"48",
	"full",
] as const;

export type SkeletonControlWidth = (typeof SKELETON_CONTROL_WIDTHS)[number];

const CONTROL_CLASS =
	"h-9 max-w-full shrink-0 data-[width=20]:w-20 data-[width=24]:w-24 data-[width=28]:w-28 data-[width=32]:w-32 data-[width=48]:w-48 data-[width=full]:w-full";

function SkeletonControl({ width = "24" }: { width?: SkeletonControlWidth }) {
	return (
		<Skeleton
			className={CONTROL_CLASS}
			data-slot="control-skeleton"
			data-width={width}
		/>
	);
}

export {
	SkeletonBlock,
	SkeletonControl,
	SkeletonField,
	SkeletonLine,
	SkeletonMark,
};
