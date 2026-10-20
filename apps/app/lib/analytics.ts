const ANALYTICS_HOSTS: readonly string[] = ["trycrm.ai", "www.trycrm.ai"];

export function analyticsAllowed(hostname: string): boolean {
	return ANALYTICS_HOSTS.includes(hostname.trim().toLowerCase());
}
