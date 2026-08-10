const TRANSPORT_ONLY_SUFFIX = ".appended";

export function isTransportOnlyEvent(type: string): boolean {
	return type.endsWith(TRANSPORT_ONLY_SUFFIX);
}
