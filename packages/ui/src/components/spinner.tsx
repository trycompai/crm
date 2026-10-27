import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const BARS = Array.from({ length: 10 }, (_, index) => ({
	angle: index * 36,
	opacity: 0.15 + (0.85 * index) / 9,
}));

const spinnerVariants = cva("shrink-0 animate-spinner", {
	variants: {
		size: {
			default: "",
			lg: "size-10",
		},
	},
	defaultVariants: {
		size: "default",
	},
});

function Spinner({
	className,
	size,
	...props
}: React.ComponentProps<"svg"> & VariantProps<typeof spinnerVariants>) {
	return (
		<svg
			data-slot="spinner"
			role="status"
			aria-label="Loading"
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			width={16}
			height={16}
			fill="none"
			className={cn(spinnerVariants({ size }), className)}
			{...props}
		>
			{BARS.map((bar) => (
				<line
					key={bar.angle}
					opacity={bar.opacity}
					stroke="currentColor"
					strokeLinecap="round"
					strokeWidth={2}
					transform={`rotate(${bar.angle} 12 12)`}
					x1={12}
					x2={12}
					y1={2.5}
					y2={7}
				/>
			))}
		</svg>
	);
}

export { Spinner };
