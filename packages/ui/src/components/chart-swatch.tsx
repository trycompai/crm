import { cva, type VariantProps } from "class-variance-authority";
import { type ChartColor, chartSwatch } from "../lib/chart-config";

const chartSwatchVariants = cva(
	"shrink-0 forced-colors:outline-1 forced-colors:outline-[CanvasText] forced-colors:outline-solid forced-colors:forced-color-adjust-none",
	{
		variants: {
			size: {
				default: "size-2 rounded-[2px]",
				sm: "size-1.5",
			},
		},
		defaultVariants: {
			size: "default",
		},
	},
);

function ChartSwatch({
	color,
	size,
}: { color: ChartColor } & VariantProps<typeof chartSwatchVariants>) {
	return (
		<span
			aria-hidden
			data-slot="chart-swatch"
			className={chartSwatchVariants({ size })}
			style={{ backgroundColor: chartSwatch(color) }}
		/>
	);
}

export { ChartSwatch };
