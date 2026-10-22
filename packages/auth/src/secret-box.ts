import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export type SecretBox = {
	encrypt(value: string, purpose: string): string;
	decrypt(value: string, purpose: string): string;
};

export function createSecretBox(
	source: string | undefined,
): SecretBox | undefined {
	if (!source) return undefined;
	const key = Buffer.from(source, "base64");
	if (key.length !== KEY_BYTES) return undefined;

	return {
		encrypt(value, purpose) {
			const iv = randomBytes(IV_BYTES);
			const cipher = createCipheriv(ALGORITHM, key, iv);
			cipher.setAAD(Buffer.from(purpose));
			const encrypted = Buffer.concat([
				cipher.update(value, "utf8"),
				cipher.final(),
			]);
			const tag = cipher.getAuthTag();

			return [
				VERSION,
				iv.toString("base64url"),
				tag.toString("base64url"),
				encrypted.toString("base64url"),
			].join(".");
		},
		decrypt(value, purpose) {
			const [version, ivText, tagText, encryptedText, extra] = value.split(".");
			if (
				version !== VERSION ||
				!ivText ||
				!tagText ||
				encryptedText === undefined ||
				extra !== undefined
			) {
				throw new Error("The encrypted secret has an invalid format.");
			}

			const decipher = createDecipheriv(
				ALGORITHM,
				key,
				Buffer.from(ivText, "base64url"),
			);
			decipher.setAAD(Buffer.from(purpose));
			decipher.setAuthTag(Buffer.from(tagText, "base64url"));

			return Buffer.concat([
				decipher.update(Buffer.from(encryptedText, "base64url")),
				decipher.final(),
			]).toString("utf8");
		},
	};
}
