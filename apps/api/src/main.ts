import { Logger } from "@nestjs/common";
import { createApp } from "./create-app";

async function bootstrap() {
	const app = await createApp();
	app.enableShutdownHooks();

	const port = process.env.PORT ?? 3001;
	await app.listen(port);

	new Logger("Bootstrap").log({
		message: `API listening on http://localhost:${port}`,
		port: Number(port),
		environment: process.env.NODE_ENV ?? "development",
	});
}

void bootstrap().catch((cause: unknown) => {
	new Logger("Bootstrap").fatal(
		{ message: "API failed to start" },
		cause instanceof Error ? cause.stack : String(cause),
	);
	process.exit(1);
});
