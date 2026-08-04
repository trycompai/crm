import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
	ExpressAdapter,
	type NestExpressApplication,
} from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { ContextLogger } from "./logging/context-logger";

export async function createApp(): Promise<NestExpressApplication> {
	const app = await NestFactory.create<NestExpressApplication>(
		AppModule,
		new ExpressAdapter(),
		{ bodyParser: false, logger: new ContextLogger() },
	);

	// The product lead endpoints verify an HMAC over the exact request bytes.
	// Capture only those routes before Better Auth can consume the stream.
	app.use(
		"/integrations/v1",
		(request: Request, response: Response, next: NextFunction) => {
			const chunks: Buffer[] = [];
			let size = 0;
			let rejected = false;

			request.on("data", (chunk: Buffer | string) => {
				if (rejected) return;
				const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
				size += buffer.length;
				if (size > 32 * 1024) {
					rejected = true;
					response.status(413).json({ message: "Payload too large." });
					return;
				}
				chunks.push(buffer);
			});
			request.on("end", () => {
				if (rejected) return;
				request.body = Buffer.concat(chunks);
				next();
			});
			request.on("error", (error: Error) => {
				if (!rejected) next(error);
			});
		},
	);
	app.use(helmet());
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: { enableImplicitConversion: true },
		}),
	);

	return app;
}
