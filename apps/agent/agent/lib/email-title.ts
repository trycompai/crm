const QUOTED_HISTORY =
	/^(?:On .+ wrote:\s*$|From:\s|Begin forwarded message:|[-_]{3,}(?:\s*(?:Original|Forwarded) message\s*-+)?$)/iu;
const SIGN_OFF =
	/^(?:--|(?:best(?: regards)?|(?:kind |warm )?regards|sincerely|thanks|thank you|many thanks|cheers|take care|此致|谢谢)[,.!，。！]*)$/iu;
const AFTER_TITLE =
	"(?=$|\\s*[,.;:!?|·•–—。！？；]|\\s+(?:at|for|with|since)\\b)";

type EmailTitle = { reply?: string; signature?: string };

export function emailTitleEvidence(
	email: { body: string | null; fromName: string | null },
	title: string,
): EmailTitle {
	const phrase = normalize(title).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	if (!phrase || !email.body) return {};

	const lines = email.body.split(/\r?\n/).map((line) => line.trim());
	const quotedAt = lines.findIndex((line) => QUOTED_HISTORY.test(line));
	const authored = lines
		.slice(0, quotedAt === -1 ? undefined : quotedAt)
		.filter((line) => !line.startsWith(">"));
	const sender = normalize(email.fromName ?? "").toLowerCase();
	let signatureAt = -1;
	let hasContentBelow = false;
	for (let index = authored.length - 1; index >= 0; index--) {
		const line = authored[index];
		if (!line) continue;
		if (hasContentBelow && SIGN_OFF.test(line)) {
			signatureAt = index;
			break;
		}
		if (
			hasContentBelow &&
			signatureAt === -1 &&
			sender &&
			normalize(line).toLowerCase() === sender
		) {
			signatureAt = index;
		}
		hasContentBelow = true;
	}
	const body = authored.slice(0, signatureAt === -1 ? undefined : signatureAt);
	const signature = signatureAt === -1 ? [] : authored.slice(signatureAt + 1);

	const selfDescription = new RegExp(
		`(?:\\b(?:i (?:am|work as|serve as|hold the role of)|i['’]m|my (?:job )?title is) (?:the |an? )?|我的(?:职位|职务)是|我(?:担任|是))${phrase}${AFTER_TITLE}`,
		"iu",
	);
	const signatureTitle = new RegExp(
		`^(?:title\\s*:\\s*)?${phrase}${AFTER_TITLE}`,
		"iu",
	);

	return {
		reply: selfDescription.exec(normalize(body.join(" ")))?.[0],
		signature: signature.find((line) => signatureTitle.test(normalize(line))),
	};
}

function normalize(value: string): string {
	return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}
