export const SKELETON = {
	rows: {
		feed: 4,
		rail: 5,
		fields: 4,
		messages: 3,
		editor: 3,
	},
} as const;

export function skeletonRows(count: number): string[] {
	return Array.from({ length: count }, (_, index) => `row-${index}`);
}
