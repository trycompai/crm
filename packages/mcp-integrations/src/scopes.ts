export type GrantedScopeGroup = {
	id: string;
	label: string;
	scopes: string[];
};

type ScopeGroupDefinition = {
	id: string;
	label: string;
	patterns: readonly RegExp[];
};

const CLOUDFLARE_SCOPE_GROUPS: readonly ScopeGroupDefinition[] = [
	{
		id: "ai",
		label: "AI",
		patterns: [
			/^(?:ai(?:-|\.)|aig\.|aiaudit\.|agent-memory\.|agw\.|browser-rendering\.|cf-agents\.|rag\.|vectorize\.|websearch\.|workers_ai\.)/,
		],
	},
	{
		id: "analytics",
		label: "Analytics and logs",
		patterns: [
			/(?:analytics|logs|observability|pcaps|radar|reports-|request-tracer)/,
		],
	},
	{
		id: "email",
		label: "Email and messaging",
		patterns: [/^(?:email-|messaging\.|notifications\.)/],
	},
	{
		id: "media",
		label: "Images and video",
		patterns: [/^(?:images\.|stream\.)/],
	},
	{
		id: "storage",
		label: "Data and storage",
		patterns: [
			/^(?:d1\.|k2\.|r2-|workers-kv-storage\.|workers-r2(?:-|\.)|queues\.|artifacts\.)/,
		],
	},
	{
		id: "compute",
		label: "Compute",
		patterns: [
			/^(?:calls\.|cloudchamber\.|constellation\.|containers\.|iot\.|pages\.|pipelines\.|pubsub\.|realtime\.|workers-(?:ci|routes|scripts|tail)\.)/,
		],
	},
	{
		id: "zero-trust",
		label: "Zero Trust",
		patterns: [
			/^(?:access(?:-|\.)|casb\.|connectivity-directory\.|dls\.|scim-provisioning\.|teams(?:-|\.)|argotunnel\.)/,
		],
	},
	{
		id: "security",
		label: "Security",
		patterns: [
			/(?:bot-management|certificate|challenge|cloudforce-one|ddos|firewall|fraud|intel\.|page(?:-|\.)shield|sanitize|secret|security|ssl|trust-and-safety|url-scanner|waf)/,
		],
	},
	{
		id: "dns-domains",
		label: "DNS and domains",
		patterns: [
			/^(?:dns(?:-|\.)|domain-page|registrar-|web3-hostnames\.|zone(?:-|\.))|account-dns-settings/,
		],
	},
	{
		id: "network",
		label: "Network",
		patterns: [
			/^(?:address-maps\.|chinanetwork-steering\.|cloud-connector\.|healthcheck\.|ip-prefix|load-balanc|magic-|moq\.|origin\.|waiting-rooms\.)/,
		],
	},
	{
		id: "delivery",
		label: "Delivery and performance",
		patterns: [
			/(?:cache|cfspeed|custom-(?:errors|pages)|dynamic-redirect|field-extractor|http-applications|managed-headers|mass-url-redirects|page-rules|page\.(?:read|write)|query-cache|response-compression|snippets|transform-rules|zaraz)/,
		],
	},
	{
		id: "platform",
		label: "Platform services",
		patterns: [
			/^(?:api-gateway\.|apps\.|config-settings\.|fbm\.|flagship\.|integration\.|mcp-portals\.|payments-gateway\.|precursor\.|resource-|select-configuration\.)/,
		],
	},
	{
		id: "account",
		label: "Account and identity",
		patterns: [
			/^(?:account(?:-|:)|memberships\.|offline_access$|tag\.|user(?::|\.)|user-details\.)/,
		],
	},
];

const DEFAULT_SCOPE_GROUPS: readonly ScopeGroupDefinition[] = [
	{ id: "access", label: "Access", patterns: [/.*/] },
];

export function groupGrantedScopes(
	platformSlug: string,
	scopes: readonly string[],
): GrantedScopeGroup[] {
	const definitions =
		platformSlug === "cloudflare"
			? CLOUDFLARE_SCOPE_GROUPS
			: DEFAULT_SCOPE_GROUPS;
	const grouped = new Map<string, string[]>();
	const other: string[] = [];

	for (const scope of scopes) {
		const definition = definitions.find((candidate) =>
			candidate.patterns.some((pattern) => pattern.test(scope)),
		);
		if (!definition) {
			other.push(scope);
			continue;
		}
		const values = grouped.get(definition.id) ?? [];
		values.push(scope);
		grouped.set(definition.id, values);
	}

	const groups = definitions.flatMap((definition) => {
		const values = grouped.get(definition.id);
		return values
			? [
					{
						id: definition.id,
						label: definition.label,
						scopes: [...values].sort(),
					},
				]
			: [];
	});

	return other.length > 0
		? [...groups, { id: "other", label: "Other", scopes: [...other].sort() }]
		: groups;
}
