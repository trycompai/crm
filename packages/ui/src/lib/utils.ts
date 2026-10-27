import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			"font-size": [{ text: ["11", "13", "15", "26", "28", "32"] }],
			shadow: [
				{
					shadow: [
						"border",
						"border-strong",
						"menu",
						"modal",
						"raised",
						"divider",
						"focus",
						"picker",
					],
				},
			],
			transition: [{ transition: ["size", "progress"] }],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
