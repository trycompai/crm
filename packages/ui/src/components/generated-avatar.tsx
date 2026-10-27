import { seedHash, seedPalette } from "@crm/ui/lib/seed-palette";
import { cn } from "@crm/ui/lib/utils";

export type GeneratedAvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "fill";

const SIZE: Record<GeneratedAvatarSize, string> = {
	fill: "size-full",
	xs: "size-4",
	sm: "size-5",
	md: "size-6",
	lg: "size-8",
	xl: "size-12",
};

const BOX = 50;

type Dot = { x: number; y: number; r: number; tone: 1 | 2 };

function glyphDots(value: number, inset: number): Dot[] {
	let bits = value & 0x7fff;
	let count = 0;

	for (let bit = 0; bit < 15; bit += 1) {
		count += (bits >> bit) & 1;
	}

	if (count < 6) {
		bits = ~bits & 0x7fff;
	}

	const cell = (BOX - inset * 2) / 5;
	const dots: Dot[] = [];

	for (let y = 0; y < 5; y += 1) {
		for (let x = 0; x < 5; x += 1) {
			const column = x > 2 ? 4 - x : x;

			if ((bits >> (y * 3 + column)) & 1) {
				dots.push({
					x: inset + (x + 0.5) * cell,
					y: inset + (y + 0.5) * cell,
					r: cell * 0.42,
					tone: x === 2 ? 2 : 1,
				});
			}
		}
	}

	const xs = dots.map((dot) => dot.x);
	const ys = dots.map((dot) => dot.y);
	const shiftX = BOX / 2 - (Math.min(...xs) + Math.max(...xs)) / 2;
	const shiftY = BOX / 2 - (Math.min(...ys) + Math.max(...ys)) / 2;

	return dots.map((dot) => ({ ...dot, x: dot.x + shiftX, y: dot.y + shiftY }));
}

function GeneratedAvatar({
	seed,
	kind = "person",
	size = "md",
}: {
	seed: string;
	kind?: "person" | "workspace";
	size?: GeneratedAvatarSize;
}) {
	const value = seedHash(seed);
	const palette = seedPalette(value);
	const person = kind === "person";
	const dots = glyphDots(value, person ? 7 : 5);

	return (
		<svg
			aria-hidden
			className={cn(
				"shrink-0 overflow-hidden",
				SIZE[size],
				person ? "rounded-full" : "rounded-md",
			)}
			data-kind={kind}
			data-slot="generated-avatar"
			focusable={false}
			viewBox={`0 0 ${BOX} ${BOX}`}
		>
			<rect fill={palette[0]} height={BOX} width={BOX} />
			{dots.map((dot) => (
				<circle
					cx={dot.x}
					cy={dot.y}
					fill={palette[dot.tone]}
					key={`${dot.x}-${dot.y}`}
					r={dot.r}
				/>
			))}
		</svg>
	);
}

export { GeneratedAvatar };
