import { cn } from "@crm/ui/lib/utils";

const GRID = 5;
const CELLS = Array.from({ length: GRID * GRID }, (_, index) => index);
const CENTER = (GRID - 1) / 2;
const CYCLE_MS = 1400;

function delayFor(index: number): number {
	const row = Math.floor(index / GRID);
	const column = index % GRID;
	const distance = Math.max(Math.abs(row - CENTER), Math.abs(column - CENTER));
	return (distance / CENTER) * (CYCLE_MS / 2);
}

export function DotMatrix({
	className,
	label = "Loading",
	decorative = false,
}: {
	className?: string;
	label?: string;
	decorative?: boolean;
}) {
	return (
		<span
			aria-hidden={decorative ? "true" : undefined}
			aria-label={decorative ? undefined : label}
			className={cn(
				"grid size-3.5 shrink-0 grid-cols-5 grid-rows-5 gap-px text-current",
				className,
			)}
			role={decorative ? undefined : "status"}
		>
			{CELLS.map((index) => (
				<span
					className="size-0.5 animate-pulse rounded-full bg-current opacity-20 motion-reduce:animate-none"
					key={index}
					style={{
						animationDelay: `${delayFor(index)}ms`,
						animationDuration: `${CYCLE_MS}ms`,
					}}
				/>
			))}
		</span>
	);
}
