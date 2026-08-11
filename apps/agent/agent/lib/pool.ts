export function collapsing<A extends unknown[]>(
	run: (...args: A) => Promise<void>,
): (...args: A) => Promise<void> {
	let active: Promise<void> | null = null;
	let trailing: A | null = null;

	const invoke = async (...args: A): Promise<void> => {
		if (active) {
			trailing = args;
			return active;
		}

		active = run(...args);

		let failure: { error: unknown } | null = null;

		try {
			await active;
		} catch (error) {
			failure = { error };
		} finally {
			active = null;
		}

		const next = trailing;
		trailing = null;

		if (next) {
			const catchUp = invoke(...next);
			await (failure ? catchUp.catch(() => {}) : catchUp);
		}

		if (failure) throw failure.error;
	};

	return invoke;
}

export async function runLimited<T>(
	concurrency: number,
	items: readonly T[],
	run: (item: T) => Promise<void>,
	signal?: AbortSignal,
): Promise<void> {
	const width = Math.max(1, Math.min(concurrency, items.length));
	const queue = items[Symbol.iterator]();

	const workers = Array.from({ length: width }, async () => {
		for (const item of queue) {
			if (signal?.aborted) break;
			await run(item);
		}
	});

	await Promise.all(workers);
}
