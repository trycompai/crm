import type * as React from "react";

type BotProps = React.SVGProps<SVGSVGElement> & {
	size?: number | string;
};

export default function Bot({ size = 16, ...rest }: BotProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 32 32"
			xmlns="http://www.w3.org/2000/svg"
			fill="currentColor"
			{...rest}
		>
			<path
				fillRule="evenodd"
				d="M2,16a14,14,0,1,0,28,0a14,14,0,1,0,-28,0Z M4,16a12,12,0,1,0,24,0a12,12,0,1,0,-24,0Z"
			/>
			<rect
				x="9.5"
				y="11"
				width="3"
				height="8"
				rx="1.5"
				transform="rotate(-10 11 15)"
			/>
			<rect
				x="19.5"
				y="11"
				width="3"
				height="8"
				rx="1.5"
				transform="rotate(10 21 15)"
			/>
		</svg>
	);
}
