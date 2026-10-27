import { type ReactNode, type Ref, useId } from "react";

function PageSection({
	title,
	description,
	action,
	anchor,
	headingRef,
	children,
}: {
	title: ReactNode;
	description?: ReactNode;
	action?: ReactNode;
	anchor?: string;
	headingRef?: Ref<HTMLHeadingElement>;
	children?: ReactNode;
}) {
	const headingId = useId();

	return (
		<section
			aria-labelledby={headingId}
			className="flex min-w-0 scroll-mt-6 flex-col gap-4"
			data-slot="page-section"
			id={anchor}
		>
			<div className="flex min-w-0 items-start justify-between gap-4">
				<div className="flex min-w-0 flex-col gap-2">
					<h2
						className="text-balance font-semibold text-base tracking-tight outline-none"
						id={headingId}
						ref={headingRef}
						tabIndex={-1}
					>
						{title}
					</h2>
					{description ? (
						<p className="max-w-prose text-pretty text-muted-foreground text-sm">
							{description}
						</p>
					) : null}
				</div>
				{action ? (
					<div className="-my-1 flex shrink-0 gap-2">{action}</div>
				) : null}
			</div>
			{children}
		</section>
	);
}

export { PageSection };
