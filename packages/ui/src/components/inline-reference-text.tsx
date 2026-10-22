import { Fragment } from "react";

export function InlineReferenceText({ children }: { children: string }) {
	return children.split(/(`[^`\n]+`)/g).map((part, index) => {
		const reference = part.startsWith("`") && part.endsWith("`");
		return reference ? (
			<code
				key={`${index}-${part}`}
				className="rounded-sm bg-background px-1 py-0.5 font-mono text-[0.85em] text-foreground"
			>
				{part.slice(1, -1)}
			</code>
		) : (
			<Fragment key={`${index}-${part}`}>{part}</Fragment>
		);
	});
}
