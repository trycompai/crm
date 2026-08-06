"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import { Questionnaire as QuestionnairePrimitive } from "@shadcn/react/questionnaire";
import type * as React from "react";
import { buttonVariants, type Button } from "./button";
import { Icon } from "./icon";
import { cn } from "../lib/utils";

function Questionnaire({
	className,
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Root>) {
	return (
		<QuestionnairePrimitive.Root
			data-slot="questionnaire"
			className={cn("flex w-full min-w-0 flex-col gap-4", className)}
			{...props}
		/>
	);
}

function QuestionnaireProgress({
	className,
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Progress>) {
	return (
		<QuestionnairePrimitive.Progress
			data-slot="questionnaire-progress"
			className={cn(
				"min-h-[1lh] w-fit min-w-[14ch] font-medium text-muted-foreground text-xs tabular-nums",
				className,
			)}
			{...props}
		/>
	);
}

function QuestionnaireItem({
	className,
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Item>) {
	return (
		<QuestionnairePrimitive.Item
			data-slot="questionnaire-item"
			className={cn(
				"flex min-w-0 flex-col gap-4 border-0 p-0 outline-none",
				className,
			)}
			{...props}
		/>
	);
}

function QuestionnaireTitle({
	className,
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Title>) {
	return (
		<QuestionnairePrimitive.Title
			data-slot="questionnaire-title"
			className={cn(
				"text-pretty font-medium text-base leading-snug [&:not(:has(~[data-slot=questionnaire-description]))]:mb-4",
				className,
			)}
			{...props}
		/>
	);
}

function QuestionnaireDescription({
	className,
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Description>) {
	return (
		<QuestionnairePrimitive.Description
			data-slot="questionnaire-description"
			className={cn("text-pretty text-muted-foreground text-sm", className)}
			{...props}
		/>
	);
}

function QuestionnaireChoices({
	className,
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Choices>) {
	return (
		<QuestionnairePrimitive.Choices
			data-slot="questionnaire-choices"
			className={cn(
				"group/questionnaire-choices grid min-w-0 gap-2",
				className,
			)}
			{...props}
		/>
	);
}

function QuestionnaireChoice({
	children,
	className,
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Choice>) {
	return (
		<QuestionnairePrimitive.Choice
			data-slot="questionnaire-choice"
			className={cn(
				"group/questionnaire-choice relative flex min-h-11 cursor-pointer select-none items-start gap-2.5 rounded-md border border-input bg-transparent px-3 py-2.5 text-start text-sm outline-none transition-colors hover:bg-muted/50 has-[>input:focus-visible]:border-ring has-[>input:focus-visible]:ring-3 has-[>input:focus-visible]:ring-ring/50 data-checked:border-primary/40 data-checked:bg-muted data-invalid:border-destructive data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 dark:bg-input/20 dark:data-checked:bg-muted",
				className,
			)}
			{...props}
		>
			<QuestionnairePrimitive.ChoiceInput
				data-slot="questionnaire-choice-input"
				className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
			/>
			<span
				aria-hidden="true"
				data-slot="questionnaire-choice-indicator"
				className="pointer-events-none relative flex size-4 shrink-0 items-center justify-center rounded-sm border border-input group-data-[type=radio]/questionnaire-choice:rounded-full group-data-checked/questionnaire-choice:border-primary group-data-checked/questionnaire-choice:bg-primary group-data-checked/questionnaire-choice:text-primary-foreground dark:bg-input/30 dark:group-data-checked/questionnaire-choice:bg-primary"
			>
				<span
					data-slot="questionnaire-choice-indicator-dot"
					className="hidden size-2 rounded-full bg-primary-foreground group-data-[type=checkbox]/questionnaire-choice:hidden group-data-checked/questionnaire-choice:block"
				/>
				<Icon
					icon={Checkmark}
					motion="none"
					data-slot="questionnaire-choice-indicator-check"
					className="hidden group-data-[type=radio]/questionnaire-choice:hidden group-data-checked/questionnaire-choice:block"
				/>
			</span>
			<QuestionnairePrimitive.ChoiceLabel
				data-slot="questionnaire-choice-label"
				className="flex min-w-0 flex-1 flex-col gap-0.5 leading-snug"
			>
				{children}
			</QuestionnairePrimitive.ChoiceLabel>
			<QuestionnairePrimitive.ChoiceShortcut
				data-slot="questionnaire-choice-shortcut"
				className="pointer-events-none ms-auto mt-0.5 hidden size-5 shrink-0 items-center justify-center rounded-md border border-input bg-background font-mono font-medium text-[0.625rem] text-muted-foreground leading-none group-data-[shortcut]/questionnaire-choice:inline-flex"
			/>
		</QuestionnairePrimitive.Choice>
	);
}

function QuestionnaireInput({
	className,
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Input>) {
	return (
		<div
			data-slot="questionnaire-input-wrapper"
			className="group/questionnaire-input relative w-full min-w-0"
		>
			<QuestionnairePrimitive.Input
				data-slot="questionnaire-input"
				className={cn(
					"h-8 min-h-11 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 sm:min-h-0 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
					"selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground",
					className,
				)}
				{...props}
			/>
		</div>
	);
}

function QuestionnaireError({
	className,
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Error>) {
	return (
		<QuestionnairePrimitive.Error
			data-slot="questionnaire-error"
			className={cn("text-destructive text-sm", className)}
			{...props}
		/>
	);
}

function QuestionnaireActions({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="questionnaire-actions"
			className={cn(
				"grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 sm:min-h-8",
				className,
			)}
			{...props}
		/>
	);
}

function QuestionnairePrevious({
	children,
	className,
	size = "default",
	variant = "outline",
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Previous> &
	Pick<React.ComponentProps<typeof Button>, "size" | "variant">) {
	return (
		<QuestionnairePrimitive.Previous
			data-slot="questionnaire-previous"
			data-size={size}
			data-variant={variant}
			className={cn(
				buttonVariants({ size, variant }),
				"col-start-1 row-start-1 min-h-11 justify-self-start sm:min-h-0",
				className,
			)}
			{...props}
		>
			{children ?? "Previous"}
		</QuestionnairePrimitive.Previous>
	);
}

function QuestionnaireSkip({
	children,
	className,
	size = "default",
	variant = "outline",
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Skip> &
	Pick<React.ComponentProps<typeof Button>, "size" | "variant">) {
	return (
		<QuestionnairePrimitive.Skip
			data-slot="questionnaire-skip"
			data-size={size}
			data-variant={variant}
			className={cn(
				buttonVariants({ size, variant }),
				"col-start-2 row-start-1 min-h-11 justify-self-end sm:min-h-0",
				className,
			)}
			{...props}
		>
			{children ?? "Skip"}
		</QuestionnairePrimitive.Skip>
	);
}

function QuestionnaireNext({
	children,
	className,
	size = "default",
	variant = "default",
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Next> &
	Pick<React.ComponentProps<typeof Button>, "size" | "variant">) {
	return (
		<QuestionnairePrimitive.Next
			data-slot="questionnaire-next"
			data-size={size}
			data-variant={variant}
			className={cn(
				buttonVariants({ size, variant }),
				"col-start-3 row-start-1 min-h-11 justify-self-end sm:min-h-0",
				className,
			)}
			{...props}
		>
			{children ?? "Next"}
		</QuestionnairePrimitive.Next>
	);
}

function QuestionnaireSubmit({
	children,
	className,
	size = "default",
	variant = "default",
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Submit> &
	Pick<React.ComponentProps<typeof Button>, "size" | "variant">) {
	return (
		<QuestionnairePrimitive.Submit
			data-slot="questionnaire-submit"
			data-size={size}
			data-variant={variant}
			className={cn(
				buttonVariants({ size, variant }),
				"col-start-3 row-start-1 min-h-11 justify-self-end sm:min-h-0",
				className,
			)}
			{...props}
		>
			{children ?? "Submit"}
		</QuestionnairePrimitive.Submit>
	);
}

export {
	Questionnaire,
	QuestionnaireActions,
	QuestionnaireChoice,
	QuestionnaireChoices,
	QuestionnaireDescription,
	QuestionnaireError,
	QuestionnaireInput,
	QuestionnaireItem,
	QuestionnaireNext,
	QuestionnairePrevious,
	QuestionnaireProgress,
	QuestionnaireSkip,
	QuestionnaireSubmit,
	QuestionnaireTitle,
};
