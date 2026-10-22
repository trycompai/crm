export function CodeBlock({
	children,
	highlightedHTML,
	label,
}: {
	children: string;
	highlightedHTML?: string;
	label?: string;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-2">
			{label ? <p className="font-medium text-foreground text-xs">{label}</p> : null}
			{highlightedHTML ? (
				<div
					className="max-h-56 overflow-auto rounded-md border bg-background text-xs [&_.shiki]:m-0 [&_.shiki]:min-w-max [&_.shiki]:bg-transparent [&_.shiki]:p-4 [&_.shiki]:font-mono [&_.shiki]:text-xs/5 [&_.shiki_span]:[color:var(--shiki-light)] dark:[&_.shiki_span]:[color:var(--shiki-dark)]"
					dangerouslySetInnerHTML={{ __html: highlightedHTML }}
				/>
			) : (
				<pre className="max-h-56 overflow-auto rounded-md border bg-background p-4 font-mono text-code-foreground text-xs/5">
					<code>{children}</code>
				</pre>
			)}
		</div>
	);
}
