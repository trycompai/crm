export function searchTerms(local: string): string[] {
	const handle = local.toLowerCase().replace(/[^a-z0-9._-]/g, "");
	const terms: string[] = [];

	const add = (term: string) => {
		if (term.length >= 3 && !terms.includes(term)) terms.push(term);
	};

	const parts = handle.split(/[._-]+/).filter(Boolean);
	if (parts.length > 1) {
		add(parts.join(" "));
		add(parts[parts.length - 1] as string);
	}

	add(handle);

	if (parts.length === 1) {
		add(handle.slice(1));
		add(handle.slice(2));
	}

	return terms;
}

export function looksLikeSameCompany(
	employer: string,
	companyName: string,
	domain: string,
): boolean {
	const a = normalise(employer);
	const b = normalise(companyName);
	const c = normalise(domain.replace(/\.[a-z.]+$/, ""));

	if (!a || (!b && !c)) return false;
	return (
		(b !== "" && (a === b || a.includes(b) || b.includes(a))) ||
		(c !== "" && a.includes(c))
	);
}

export function nameMatchesLocalPart(
	person: { firstName: string | null; lastName: string | null },
	local: string,
): boolean {
	const first = normalise(person.firstName ?? "");
	const last = normalise(person.lastName ?? "");
	const handle = normalise(local);

	if (!handle || (!first && !last)) return false;

	const forms = [
		`${first}${last}`,
		`${last}${first}`,
		`${first.slice(0, 1)}${last}`,
		`${last}${first.slice(0, 1)}`,
		`${first}${last.slice(0, 1)}`,
		first,
		last,
	].filter(Boolean);

	return forms.some(
		(form) =>
			form === handle || form.startsWith(handle) || handle.startsWith(form),
	);
}

export function isDerivedName(
	email: string | null,
	firstName: string,
	lastName: string | null,
): boolean {
	if (!email || lastName !== null) return false;
	const local = email.split("@")[0] ?? "";
	return nameMatchesLocalPart({ firstName, lastName: null }, local);
}

export function splitName(
	fullName: string,
): { firstName: string; lastName: string | null } | null {
	const cleaned = fullName.trim().replace(/\s+/g, " ");
	if (!cleaned) return null;

	const [first, ...rest] = cleaned.split(" ");
	if (!first) return null;

	return { firstName: first, lastName: rest.length ? rest.join(" ") : null };
}

export function domainOf(email: string): string | null {
	const at = email.lastIndexOf("@");
	return at > 0 ? email.slice(at + 1).toLowerCase() : null;
}

export function hostOf(value: string): string {
	const trimmed = value.trim().toLowerCase();
	if (trimmed === "") return "";

	const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
	const host = withoutScheme.split("/")[0]?.split("@").pop() ?? "";

	return host.replace(/^www\./, "").replace(/\.$/, "");
}

export function sameDomain(left: string | null, right: string): boolean {
	if (!left) return false;

	const a = hostOf(left);
	return a !== "" && a === hostOf(right);
}

export function namesMatch(a: string | null, b: string | null): boolean {
	const left = words(a);
	const right = words(b);

	if (left.length === 0 || right.length === 0) return false;
	if (left.join("") === right.join("")) return true;

	if (left.length < 2 || right.length < 2) return false;

	return left[0] === right[0] && left.at(-1) === right.at(-1);
}

function words(value: string | null): string[] {
	return (value ?? "")
		.split(/\s+/)
		.map(normalise)
		.filter((word) => word.length > 1);
}

export function normalise(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
