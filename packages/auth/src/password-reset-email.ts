import { env } from "./env";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const SUBJECT = "Reset your CRM password";

type PasswordResetEmail = {
	to: string;
	url: string;
	token: string;
	userId: string;
};

export async function sendPasswordResetEmail({
	to,
	url,
	token,
	userId,
}: PasswordResetEmail): Promise<void> {
	const config = env.passwordReset;
	if (!config) {
		throw new Error("Password reset email is not configured.");
	}

	const response = await fetch(RESEND_EMAILS_URL, {
		method: "POST",
		headers: {
			authorization: `Bearer ${config.apiKey}`,
			"content-type": "application/json",
			"Idempotency-Key": `password-reset-${userId}-${token}`,
		},
		body: JSON.stringify({
			from: config.from,
			to,
			...(config.replyTo ? { reply_to: config.replyTo } : {}),
			subject: SUBJECT,
			text: textBody(url),
			html: htmlBody(url),
		}),
	});

	if (!response.ok) {
		throw new Error(`Resend password reset email failed: ${response.status}`);
	}
}

function textBody(url: string): string {
	return [
		"Use this link to reset your CRM password:",
		"",
		url,
		"",
		"If you did not request this, you can ignore this email.",
	].join("\n");
}

function htmlBody(url: string): string {
	const safeUrl = escapeHtml(url);

	return [
		"<!doctype html>",
		'<html lang="en">',
		"<body>",
		"<p>Use this link to reset your CRM password:</p>",
		`<p><a href="${safeUrl}">Reset your CRM password</a></p>`,
		`<p><a href="${safeUrl}">${safeUrl}</a></p>`,
		"<p>If you did not request this, you can ignore this email.</p>",
		"</body>",
		"</html>",
	].join("");
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}
