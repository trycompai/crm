"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import Close from "@carbon/icons-react/es/Close";
import Warning from "@carbon/icons-react/es/Warning";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@crm/ui/components/accordion";
import { Icon } from "@crm/ui/components/icon";

export type ScopeLine = {
	scope: string;
	grant: string;
	sensitive: boolean;
};

export type ScopeGroup = {
	id: string;
	label: string;
	summary: string;
	scopes: ScopeLine[];
};

export function ScopeGroups({
	title,
	caption,
	groups,
	withheld,
	withheldNote,
}: {
	title: string;
	caption: string;
	groups: ScopeGroup[];
	withheld: ScopeLine[];
	withheldNote: string;
}) {
	return (
		<section className="flex flex-col gap-3 px-(--spacing-block-inline)">
			<div>
				<h2 className="font-medium text-sm">{title}</h2>
				<p className="text-muted-foreground text-xs">{caption}</p>
			</div>

			<Accordion className="rounded-lg border px-4" type="multiple">
				{groups.map((group) => {
					const broad = group.scopes.filter((entry) => entry.sensitive).length;

					return (
						<AccordionItem key={group.id} value={group.id}>
							<AccordionTrigger variant="plain">
								<span className="flex min-w-0 flex-1 flex-col gap-0.5 pr-4">
									<span className="font-medium text-sm">{group.label}</span>
									<span className="font-normal text-muted-foreground text-xs">
										{group.summary}
									</span>
								</span>
								<span className="shrink-0 whitespace-nowrap pt-0.5 pr-2 font-normal text-muted-foreground text-xs">
									{broad} broad of {group.scopes.length}
								</span>
							</AccordionTrigger>

							<AccordionContent>
								<ul className="flex flex-col gap-2.5 pb-3">
									{group.scopes.map((entry) => (
										<li className="flex items-start gap-2.5" key={entry.scope}>
											<Icon
												className={`mt-0.5 size-3.5 shrink-0 ${entry.sensitive ? "text-warning" : "text-success"}`}
												icon={entry.sensitive ? Warning : Checkmark}
												motion="none"
											/>
											<span className="text-sm">{entry.grant}</span>
										</li>
									))}
								</ul>
							</AccordionContent>
						</AccordionItem>
					);
				})}

				{withheld.map((entry) => (
					<div
						className="flex items-start gap-3 py-2.5 not-last:border-b"
						key={entry.scope}
					>
						<span className="flex min-w-0 flex-1 flex-col gap-0.5 pr-4">
							<span className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
								<Icon
									className="size-3.5 shrink-0"
									icon={Close}
									motion="none"
								/>
								{entry.grant}
							</span>
							<span className="text-muted-foreground text-xs">
								{withheldNote}
							</span>
						</span>
						<span className="shrink-0 whitespace-nowrap pt-0.5 pr-2 text-muted-foreground text-xs">
							Not granted
						</span>
					</div>
				))}
			</Accordion>
		</section>
	);
}
