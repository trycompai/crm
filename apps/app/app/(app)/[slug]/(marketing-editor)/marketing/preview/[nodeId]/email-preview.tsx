"use client";

import { EmailPreview as Preview } from "@crm/ui/components/email-preview";

export function EmailPreview({
	html,
	text,
	subject,
	blocked,
}: {
	html: string;
	text: string;
	subject: string;
	blocked: string | null;
}) {
	return (
		<Preview
			html={html}
			text={text}
			blocked={blocked}
			lead={
				<span className="min-w-0 max-w-xs truncate font-medium text-xs">
					{subject || "No subject yet"}
				</span>
			}
		/>
	);
}
