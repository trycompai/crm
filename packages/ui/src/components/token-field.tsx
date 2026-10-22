"use client";

import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { cn } from "@crm/ui/lib/utils";
import * as React from "react";

type TokenFieldState = {
	disabled: boolean;
	loading: boolean;
};

const TokenFieldContext = React.createContext<TokenFieldState>({
	disabled: false,
	loading: false,
});

function TokenField({
	className,
	children,
	disabled = false,
	loading = false,
	loadingLabel = "Loading",
	tabIndex,
	"aria-busy": ariaBusy,
	"aria-disabled": ariaDisabled,
	onBeforeInputCapture,
	onClickCapture,
	onCompositionEndCapture,
	onCompositionStartCapture,
	onCutCapture,
	onDropCapture,
	onInputCapture,
	onKeyDownCapture,
	onPasteCapture,
	onPointerDownCapture,
	...props
}: React.ComponentProps<"div"> & {
	disabled?: boolean;
	loading?: boolean;
	loadingLabel?: string;
}) {
	const disabledState =
		disabled || ariaDisabled === true || ariaDisabled === "true";
	const inactive = disabledState || loading;
	const guard = <T extends React.SyntheticEvent>(
		handler: ((event: T) => void) | undefined,
	) =>
		(event: T) => {
			if (inactive) {
				event.preventDefault();
				event.stopPropagation();
				return;
			}
			handler?.(event);
		};
	const guardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (inactive && event.key !== "Tab") {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		onKeyDownCapture?.(event);
	};

	return (
		<TokenFieldContext.Provider value={{ disabled: disabledState, loading }}>
			<div
				data-slot="token-field"
				data-loading={loading}
				role="group"
				aria-busy={ariaBusy ?? loading}
				aria-disabled={inactive || undefined}
				tabIndex={inactive ? -1 : tabIndex}
				className={cn(
					"max-h-40 min-h-6 w-full min-w-0 cursor-text overflow-y-auto whitespace-pre-wrap break-words px-1 text-base leading-6 outline-none data-[empty=true]:before:pointer-events-none data-[empty=true]:before:text-muted-foreground data-[empty=true]:before:content-[attr(data-placeholder)] data-[loading=true]:cursor-wait focus-within:before:hidden aria-disabled:cursor-not-allowed aria-disabled:opacity-60 sm:text-[15px] md:text-xs [&>[contenteditable]]:outline-none",
					className,
				)}
				{...props}
				onBeforeInputCapture={guard(onBeforeInputCapture)}
				onClickCapture={guard(onClickCapture)}
				onCompositionEndCapture={guard(onCompositionEndCapture)}
				onCompositionStartCapture={guard(onCompositionStartCapture)}
				onCutCapture={guard(onCutCapture)}
				onDropCapture={guard(onDropCapture)}
				onInputCapture={guard(onInputCapture)}
				onKeyDownCapture={guardKeyDown}
				onPasteCapture={guard(onPasteCapture)}
				onPointerDownCapture={guard(onPointerDownCapture)}
			>
				{children}
				<span
					data-slot="token-field-status"
					role="status"
					contentEditable={false}
					className={cn(
						"ml-1 inline-flex align-middle text-muted-foreground",
						!loading && "sr-only",
					)}
				>
					{loading ? (
						<>
							<Spinner aria-hidden="true" role="presentation" />
							<span className="sr-only">{loadingLabel}</span>
						</>
					) : null}
				</span>
			</div>
		</TokenFieldContext.Provider>
	);
}

function TokenFieldEditable({
	contentEditable = true,
	tabIndex,
	...props
}: React.ComponentProps<"span">) {
	const state = React.useContext(TokenFieldContext);
	const inactive = state.disabled || state.loading;

	return (
		<span
			data-slot="token-field-editable"
			contentEditable={inactive ? false : contentEditable}
			suppressContentEditableWarning
			tabIndex={inactive ? -1 : (tabIndex ?? -1)}
			{...props}
		/>
	);
}

function TokenFieldItem({
	className,
	...props
}: React.ComponentProps<"span">) {
	const state = React.useContext(TokenFieldContext);
	const inactive = state.disabled || state.loading;

	return (
		<span
			data-slot="token-field-item"
			aria-disabled={inactive}
			className={cn(
				"inline-flex h-6 min-w-0 max-w-full shrink-0 items-center gap-1 rounded-lg bg-tag py-0 pr-0.5 pl-0.5 align-middle text-left text-tag-foreground text-xs",
				className,
			)}
			{...props}
		/>
	);
}

function TokenFieldAction({
	className,
	disabled,
	...props
}: React.ComponentProps<typeof Button>) {
	const state = React.useContext(TokenFieldContext);
	const inactive = state.disabled || state.loading;

	return (
		<Button
			data-slot="token-field-action"
			type="button"
			variant="ghost"
			size="icon-xs"
			disabled={inactive || disabled}
			className={cn("size-5 rounded-lg", className)}
			{...props}
		/>
	);
}

export { TokenField, TokenFieldAction, TokenFieldEditable, TokenFieldItem };
