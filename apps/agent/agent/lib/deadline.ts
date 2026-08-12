export async function settledWithin<T>(
	work: Promise<T>,
	timeoutMs: number,
): Promise<{ settled: true; value: T } | { settled: false }> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<{ settled: false }>((resolve) => {
		timer = setTimeout(() => resolve({ settled: false }), timeoutMs);
	});

	try {
		return await Promise.race([
			work.then((value) => ({ settled: true as const, value })),
			late,
		]);
	} finally {
		clearTimeout(timer);
	}
}
