export async function withDeadline<T>(
	work: Promise<T>,
	timeoutMs: number,
	message: string,
): Promise<T> {
	work.catch(() => {});

	let timer: ReturnType<typeof setTimeout> | undefined;
	const expire = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(message)), timeoutMs);
	});

	try {
		return await Promise.race([work, expire]);
	} finally {
		clearTimeout(timer);
	}
}
