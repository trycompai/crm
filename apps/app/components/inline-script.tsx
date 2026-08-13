export function InlineScript({ html }: { html: string }) {
	return (
		<script
			type={globalThis.window === undefined ? "text/javascript" : "text/plain"}
			suppressHydrationWarning
		>
			{html}
		</script>
	);
}
