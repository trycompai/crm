"use client";

import { Button } from "@crm/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@crm/ui/components/input-group";
import { useSearchInput } from "@crm/ui/hooks/use-search-input";
import { SearchIcon, XIcon } from "lucide-react";
import { useQueryStates } from "nuqs";
import type { Ref } from "react";
import { searchParsers } from "./list-search-params";

export function ListSearch({
	placeholder,
	inputRef,
}: {
	placeholder: string;
	inputRef?: Ref<HTMLInputElement>;
}) {
	const [{ q }, setState] = useQueryStates(searchParsers);

	return (
		<ListSearchInput
			committed={q}
			commit={(next) => setState({ q: next, page: 1 })}
			placeholder={placeholder}
			inputRef={inputRef}
		/>
	);
}

function ListSearchInput({
	committed,
	commit,
	placeholder,
	inputRef,
}: {
	committed: string;
	commit: (value: string) => void;
	placeholder: string;
	inputRef?: Ref<HTMLInputElement>;
}) {
	const [value, setValue] = useSearchInput(committed, commit);

	return (
		<InputGroup className="w-full sm:w-64">
			<InputGroupAddon>
				<SearchIcon />
			</InputGroupAddon>
			<InputGroupInput
				ref={inputRef}
				aria-label={placeholder}
				type="search"
				placeholder={placeholder}
				value={value}
				onChange={(event) => setValue(event.target.value)}
				autoComplete="off"
			/>
			{value ? (
				<InputGroupAddon align="inline-end">
					<InputGroupButton
						aria-label="Clear search"
						size="icon-xs"
						onClick={() => {
							setValue("");
							commit("");
						}}
					>
						<XIcon />
					</InputGroupButton>
				</InputGroupAddon>
			) : null}
		</InputGroup>
	);
}

export function NoSearchMatch({
	query,
	noun,
}: {
	query: string;
	noun: string;
}) {
	const [, setState] = useQueryStates(searchParsers);

	return (
		<Empty>
			<EmptyMedia variant="icon">
				<SearchIcon />
			</EmptyMedia>
			<EmptyHeader>
				<EmptyTitle>
					No {noun} match “{query}”
				</EmptyTitle>
				<EmptyDescription>
					Check the spelling or try a shorter word.
				</EmptyDescription>
			</EmptyHeader>
			<Button
				onClick={() => setState({ q: "", page: 1 })}
				size="sm"
				variant="outline"
			>
				Clear search
			</Button>
		</Empty>
	);
}
