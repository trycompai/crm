import { existsSync } from "node:fs";
import { EMAIL_REVIEW } from "./email-review-config";

export function resolveChrome(
	candidates: readonly string[] = EMAIL_REVIEW.chrome.knownPaths,
): string | null {
	const fromEnv = process.env[EMAIL_REVIEW.chrome.env]?.trim();

	if (fromEnv) return existsSync(fromEnv) ? fromEnv : null;

	for (const candidate of candidates) {
		if (existsSync(candidate)) return candidate;
	}

	return null;
}
