import { TRPCClientError } from "@trpc/client";

export async function nullIfMissing<T>(query: Promise<T>): Promise<T | null> {
	try {
		return await query;
	} catch (error) {
		if (error instanceof TRPCClientError && error.data?.code === "NOT_FOUND") {
			return null;
		}

		throw error;
	}
}
