import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { RequestPrincipal } from "./request-principal";

export const Principal = createParamDecorator(
	(_data: undefined, context: ExecutionContext): RequestPrincipal | null =>
		context.switchToHttp().getRequest().principal ?? null,
);
