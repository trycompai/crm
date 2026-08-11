import { TRPCClientError } from "@trpc/client";

export function nullIfMissing(error: unknown): null {
	if (error instanceof TRPCClientError && error.data?.code === "NOT_FOUND") {
		return null;
	}

	throw error;
}
