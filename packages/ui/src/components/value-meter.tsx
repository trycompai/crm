import type { CSSProperties } from "react";
import { type ChartColor, chartSwatch } from "../lib/chart-config";

function ValueMeter({ share, color }: { share: number; color: ChartColor }) {
	return (
		<span
			data-slot="value-meter"
			className="flex h-1.5 w-full overflow-hidden bg-muted forced-colors:outline-1 forced-colors:-outline-offset-1 forced-colors:outline-[CanvasText] forced-colors:outline-solid"
		>
			<span
				data-slot="value-meter-fill"
				className="h-full w-(--share) forced-colors:outline-1 forced-colors:-outline-offset-1 forced-colors:outline-[CanvasText] forced-colors:outline-solid forced-colors:forced-color-adjust-none"
				style={
					{
						backgroundColor: chartSwatch(color),
						"--share": `${Math.round(Math.max(Math.min(share, 100), 0))}%`,
					} as CSSProperties
				}
			/>
		</span>
	);
}

export { ValueMeter };
