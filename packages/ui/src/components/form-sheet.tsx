"use client";

import { Button } from "@crm/ui/components/button";
import { useDiscardChanges } from "@crm/ui/components/discard-changes";
import { FieldGroup } from "@crm/ui/components/field";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@crm/ui/components/sheet";
import {
	type ComponentProps,
	createContext,
	type FormEvent,
	type ReactNode,
	useContext,
	useState,
} from "react";

const FormSheetContext = createContext<{
	pending: boolean;
	cancel: () => void;
} | null>(null);

function FormSheet({
	children,
	open: controlledOpen,
	defaultOpen = false,
	onOpenChange,
	dirty = false,
	pending = false,
	onDiscard,
	...props
}: ComponentProps<typeof Sheet> & {
	dirty?: boolean;
	pending?: boolean;
	onDiscard: () => void;
}) {
	const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
	const open = controlledOpen ?? uncontrolledOpen;

	const changeOpen = (next: boolean) => {
		setUncontrolledOpen(next);
		onOpenChange?.(next);
	};

	const guard = useDiscardChanges({
		open,
		dirty,
		pending,
		onOpenChange: changeOpen,
		onDiscard,
	});

	return (
		<Sheet {...props} open={open} onOpenChange={guard.onOpenChange}>
			<FormSheetContext value={{ pending, cancel: guard.discard }}>
				{children}
				{guard.dialog}
			</FormSheetContext>
		</Sheet>
	);
}

function FormSheetContent({
	onPointerDownOutside,
	...props
}: ComponentProps<typeof SheetContent>) {
	return (
		<SheetContent
			{...props}
			onPointerDownOutside={(event) => {
				onPointerDownOutside?.(event);
				event.preventDefault();
			}}
		/>
	);
}

function useFormSheetValidation() {
	const [errors, setErrors] = useState<Record<string, string>>({});

	const clearError = (id: string) => {
		setErrors((current) => {
			if (!current[id]) return current;
			const next = { ...current };
			delete next[id];
			return next;
		});
	};

	const validate = (
		form: HTMLFormElement,
		additionalErrors: Record<string, string> = {},
	) => {
		const next = { ...additionalErrors };
		for (const control of Array.from(form.elements)) {
			if (
				(control instanceof HTMLInputElement ||
					control instanceof HTMLSelectElement ||
					control instanceof HTMLTextAreaElement) &&
				!control.validity.valid
			) {
				next[control.id] = control.validationMessage;
			}
		}
		setErrors(next);
		const firstInvalid = form.querySelector<HTMLElement>(
			Object.keys(next)
				.map((id) => `[id="${CSS.escape(id)}"]`)
				.join(",") || ":not(*)",
		);
		firstInvalid?.focus();
		return Object.keys(next).length === 0;
	};

	const onInput = (event: FormEvent<HTMLFormElement>) => {
		if (event.target instanceof HTMLElement) clearError(event.target.id);
	};

	return { errors, validate, clearError, onInput, reset: () => setErrors({}) };
}

function FormSheetHeader({
	title,
	description,
}: {
	title: ReactNode;
	description?: ReactNode;
}) {
	return (
		<SheetHeader>
			<SheetTitle>{title}</SheetTitle>
			{description ? <SheetDescription>{description}</SheetDescription> : null}
		</SheetHeader>
	);
}

function FormSheetForm({
	children,
	onSubmit,
	...props
}: Omit<ComponentProps<"form">, "className">) {
	const guard = useContext(FormSheetContext);
	return (
		<form
			data-slot="form-sheet-form"
			className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
			{...props}
			aria-busy={guard?.pending || undefined}
			onSubmit={(event) => {
				if (guard?.pending) {
					event.preventDefault();
					return;
				}
				onSubmit?.(event);
			}}
		>
			<FieldGroup>{children}</FieldGroup>
		</form>
	);
}

function FormSheetFooter({
	cancelLabel = "Cancel",
	children,
}: {
	cancelLabel?: string;
	children: ReactNode;
}) {
	const guard = useContext(FormSheetContext);
	return (
		<SheetFooter className="flex-row justify-end">
			{guard ? (
				<Button
					type="button"
					variant="ghost"
					disabled={guard.pending}
					onClick={guard.cancel}
				>
					{cancelLabel}
				</Button>
			) : (
				<SheetClose asChild>
					<Button type="button" variant="ghost">
						{cancelLabel}
					</Button>
				</SheetClose>
			)}
			{children}
		</SheetFooter>
	);
}

export {
	FormSheet,
	FormSheetContent,
	FormSheetFooter,
	FormSheetForm,
	FormSheetHeader,
	useFormSheetValidation,
};
