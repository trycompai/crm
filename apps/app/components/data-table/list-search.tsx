"use client";

import Search from "@carbon/icons-react/es/Search";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@crm/ui/components/input-group";
import { useSearchInput } from "@crm/ui/hooks/use-search-input";
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
				<Search />
			</InputGroupAddon>
			<InputGroupInput
				ref={inputRef}
				placeholder={placeholder}
				value={value}
				onChange={(event) => setValue(event.target.value)}
				autoComplete="off"
			/>
		</InputGroup>
	);
}
