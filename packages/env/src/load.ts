if (process.env.NEXT_RUNTIME === undefined) {
	const { loadRootEnv } = await import("./index");
	loadRootEnv();
}
