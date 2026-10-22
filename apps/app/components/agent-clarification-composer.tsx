"use client";

import { AsyncButtonContent } from "@crm/ui/components/async-action";
import { Button } from "@crm/ui/components/button";
import { CHAT_COMPOSER_SURFACE_CLASS_NAME } from "@crm/ui/components/chat-composer";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { RadioGroup, RadioGroupItem } from "@crm/ui/components/radio-group";
import type { EveMessageInputRequest } from "eve/react";
import { type FormEvent, useState } from "react";

const OPTION_VALUE_PREFIX = "option:";

export type ClarificationResponse =
	| { requestId: string; optionId: string; text?: never }
	| { requestId: string; optionId?: never; text: string };

export function AgentClarificationComposer({
	question,
	pending,
	onSubmit,
}: {
	question: EveMessageInputRequest;
	pending: boolean;
	onSubmit: (response: ClarificationResponse) => Promise<void>;
}) {
	const options = question.options ?? [];
	const [transportError, setTransportError] = useState<string | null>(null);
	const [selectedValue, setSelectedValue] = useState("");
	const [freeformValue, setFreeformValue] = useState("");
	const showFreeform =
		question.display === "text" ||
		question.allowFreeform === true ||
		options.length === 0;

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (pending) return;
		const value = freeformValue.trim() || selectedValue;
		if (!value) {
			setTransportError("Choose an answer to continue.");
			return;
		}
		const optionId = value.startsWith(OPTION_VALUE_PREFIX)
			? value.slice(OPTION_VALUE_PREFIX.length)
			: null;
		const selectedOption = options.find((option) => option.id === optionId);
		setTransportError(null);
		try {
			const response = (
				selectedOption
					? { requestId: question.requestId, optionId: selectedOption.id }
					: { requestId: question.requestId, text: value }
			) satisfies ClarificationResponse;
			await onSubmit(response);
		} catch (error) {
			setTransportError(
				error instanceof Error && error.message.trim()
					? error.message
					: "Unable to submit. Check your connection and try again.",
			);
		}
	};

	return (
		<form
			className={CHAT_COMPOSER_SURFACE_CLASS_NAME}
			onSubmit={(event) => void submit(event)}
		>
			<FieldSet>
				<FieldLegend>{question.prompt}</FieldLegend>
				<FieldDescription>
					{options.length > 0
						? "Choose an answer, then submit."
						: "Add the detail the agent needs to continue."}
				</FieldDescription>
				{options.length > 0 ? (
					<RadioGroup
						value={selectedValue}
						disabled={pending}
						onValueChange={(value) => {
							setSelectedValue(value);
							setFreeformValue("");
							setTransportError(null);
						}}
					>
						{options.map((option) => (
							<FieldLabel
								key={option.id}
								htmlFor={`${question.requestId}-${option.id}`}
							>
								<Field orientation="horizontal">
									<FieldContent>
										<div className="font-medium">{option.label}</div>
										{option.description ? (
											<FieldDescription>{option.description}</FieldDescription>
										) : null}
									</FieldContent>
									<RadioGroupItem
										id={`${question.requestId}-${option.id}`}
										value={`${OPTION_VALUE_PREFIX}${option.id}`}
									/>
								</Field>
							</FieldLabel>
						))}
					</RadioGroup>
				) : null}
				{showFreeform ? (
					<Input
						aria-label={options.length > 0 ? "Another answer" : "Your answer"}
						placeholder="Add the detail the agent needs"
						value={freeformValue}
						disabled={pending}
						onChange={(event) => {
							setFreeformValue(event.target.value);
							setSelectedValue("");
							setTransportError(null);
						}}
					/>
				) : null}
				{transportError ? <FieldError>{transportError}</FieldError> : null}
			</FieldSet>
			<div className="flex justify-end">
				<Button type="submit" disabled={pending} aria-busy={pending} size="sm">
					<AsyncButtonContent
						status={pending ? "pending" : "idle"}
						pendingLabel="Submitting"
					>
						Submit answer
					</AsyncButtonContent>
				</Button>
			</div>
		</form>
	);
}
