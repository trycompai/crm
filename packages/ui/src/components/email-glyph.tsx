import { cn } from "@crm/ui/lib/utils";

export type EmailGlyph = { accent: boolean; lines: number };

const WIDTHS = ["w-full", "w-4/5", "w-full", "w-3/5"];

export function EmailGlyph({
	glyph,
	className,
}: {
	glyph: EmailGlyph;
	className?: string;
}) {
	const lines = Math.max(1, Math.min(WIDTHS.length, glyph.lines));

	return (
		<span
			aria-hidden
			className={cn(
				"flex h-6 w-7 shrink-0 flex-col justify-center gap-[2px] rounded-sm border bg-card px-1",
				className,
			)}
		>
			{Array.from({ length: lines }, (_, index) => (
				<span
					key={`${index}-${WIDTHS[index]}`}
					className={cn(
						"h-[2px] rounded-sm",
						WIDTHS[index],
						index === 0 && glyph.accent ? "bg-primary" : "bg-border",
					)}
				/>
			))}
		</span>
	);
}
