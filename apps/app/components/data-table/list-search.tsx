"use client";

import Search from "@carbon/icons-react/es/Search";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@crm/ui/components/input-group";
import { useSearchInput } from "@crm/ui/hooks/use-search-input";
import { useQueryStates } from "nuqs";
import { searchParsers } from "./list-search-params";

export function ListSearch({
	placeholder,
	label = "Search records",
}: {
	placeholder: string;
	label?: string;
}) {
	const [{ q }, setState] = useQueryStates(searchParsers);

	return (
		<ListSearchInput
			committed={q}
			commit={(next) => setState({ q: next, page: 1 })}
			label={label}
			placeholder={placeholder}
		/>
	);
}

function ListSearchInput({
	committed,
	commit,
	label,
	placeholder,
}: {
	committed: string;
	commit: (value: string) => void;
	label: string;
	placeholder: string;
}) {
	const [value, setValue] = useSearchInput(committed, commit);

	return (
		<InputGroup className="w-full sm:w-64">
			<InputGroupAddon>
				<Search />
			</InputGroupAddon>
			<InputGroupInput
				aria-label={label}
				placeholder={placeholder}
				value={value}
				onChange={(event) => setValue(event.target.value)}
				autoComplete="off"
			/>
		</InputGroup>
	);
}
