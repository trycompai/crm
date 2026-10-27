"use client";

import { focusRecordTitle } from "@crm/ui/components/record-sheet";
import { Sheet, SheetContent } from "@crm/ui/components/sheet";
import { useRef, useState } from "react";
import { FieldsSheetHost } from "@/components/crm/fields/fields-sheet";
import { CloseReasonDialog } from "@/components/crm/stage-change";
import { CompanySheet } from "./company-sheet";
import { ContactSheet } from "./contact-sheet";
import { DealSheet } from "./deal-sheet";
import { type RecordRef, recordKey, useRecordStack } from "./record-stack";

export function RecordSheetHost() {
	const { stack, top, closeAll, restoreFocus } = useRecordStack();

	const content = useRef<HTMLDivElement>(null);

	const [shown, setShown] = useState<RecordRef | null>(top);
	if (top && (!shown || recordKey(shown) !== recordKey(top))) {
		setShown(top);
	}

	return (
		<>
			<Sheet
				open={stack.length > 0}
				onOpenChange={(next) => {
					if (!next) closeAll();
				}}
			>
				<SheetContent
					ref={content}
					side="right"
					size="record"
					showCloseButton={false}
					tabIndex={-1}
					onOpenAutoFocus={(event) => {
						event.preventDefault();
						focusRecordTitle(content.current);
					}}
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						restoreFocus();
					}}
					className="gap-0 p-0"
				>
					{shown?.kind === "company" ? (
						<CompanySheet key={recordKey(shown)} companyId={shown.id} />
					) : null}

					{shown?.kind === "contact" ? (
						<ContactSheet key={recordKey(shown)} contactId={shown.id} />
					) : null}

					{shown?.kind === "deal" ? (
						<DealSheet key={recordKey(shown)} dealId={shown.id} />
					) : null}
				</SheetContent>
			</Sheet>

			<FieldsSheetHost />

			<CloseReasonDialog />
		</>
	);
}
