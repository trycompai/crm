import { useId, type SVGProps } from "react";

export default function SupabaseLogo(props: SVGProps<SVGSVGElement>) {
	const gradientId = useId();

	return (
		<svg viewBox="0 0 109 113" fill="none" aria-hidden="true" {...props}>
			<path
				d="M63.708 110.284c-2.837 3.572-8.588 1.615-8.656-2.956l-.999-66.668h44.804c8.116 0 12.643 9.364 7.602 15.772l-42.751 53.852Z"
				fill={`url(#${gradientId})`}
			/>
			<path
				d="M45.317 2.071c2.837-3.572 8.587-1.614 8.656 2.956l.437 66.668H10.168c-8.117 0-12.644-9.364-7.603-15.772L45.317 2.071Z"
				fill="#3ECF8E"
			/>
			<defs>
				<linearGradient
					id={gradientId}
					x1="53.973"
					y1="54.975"
					x2="94.163"
					y2="71.829"
					gradientUnits="userSpaceOnUse"
				>
					<stop stopColor="#249361" />
					<stop offset="1" stopColor="#3ECF8E" />
				</linearGradient>
			</defs>
		</svg>
	);
}
