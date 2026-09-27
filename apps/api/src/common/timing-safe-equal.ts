import { timingSafeEqual } from "node:crypto";

export function timingSafeEquals(a: string, b: string): boolean {
	const bufferA = Buffer.from(a);
	const bufferB = Buffer.from(b);

	if (bufferA.length !== bufferB.length) return false;

	return timingSafeEqual(bufferA, bufferB);
}
