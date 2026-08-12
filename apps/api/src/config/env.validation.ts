import { isRegistrableWorkspaceHost } from "@crm/auth/workspace";
import { plainToInstance, Type } from "class-transformer";
import {
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	IsUrl,
	Max,
	Min,
	MinLength,
	validateSync,
} from "class-validator";

export enum NodeEnv {
	Development = "development",
	Production = "production",
	Test = "test",
}

export class EnvironmentVariables {
	@IsEnum(NodeEnv)
	NODE_ENV: NodeEnv = NodeEnv.Development;

	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(65535)
	PORT = 3001;

	@IsString()
	@MinLength(1, {
		message:
			"DATABASE_URL is required. `docker compose up -d` starts one, or set it to any Postgres connection string.",
	})
	DATABASE_URL!: string;

	@IsOptional()
	@IsString()
	DATABASE_CA_CERT?: string;

	@IsString()
	@MinLength(32, {
		message:
			"BETTER_AUTH_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 32",
	})
	BETTER_AUTH_SECRET!: string;

	@IsString()
	@MinLength(1, {
		message:
			'ALLOWED_SIGN_IN is required — it is the only thing deciding who can sign in. Set it to your email domain, e.g. ALLOWED_SIGN_IN="acme.com", or to a single address for a one-person install.',
	})
	ALLOWED_SIGN_IN!: string;

	@IsOptional()
	@IsString()
	SIGN_IN_EMAIL_ALIASES?: string;

	@IsOptional()
	@IsString()
	GOOGLE_CLIENT_ID?: string;

	@IsOptional()
	@IsString()
	GOOGLE_CLIENT_SECRET?: string;

	@IsOptional()
	@IsString()
	MICROSOFT_CLIENT_ID?: string;

	@IsOptional()
	@IsString()
	MICROSOFT_CLIENT_SECRET?: string;

	@IsOptional()
	@IsString()
	MICROSOFT_TENANT_ID?: string;

	@IsOptional()
	@IsString()
	SLACK_CLIENT_ID?: string;

	@IsOptional()
	@IsString()
	SLACK_CLIENT_SECRET?: string;

	@IsOptional()
	@IsUrl({ require_tld: false })
	API_URL?: string;

	@IsOptional()
	@IsString()
	APP_URL?: string;

	@IsOptional()
	@IsString()
	AUTH_COOKIE_DOMAIN?: string;

	@IsOptional()
	@IsString()
	REDIS_URL?: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	CACHE_TTL_MS?: number;

	@IsOptional()
	@IsString()
	@MinLength(16, {
		message: "CRON_SECRET must be at least 16 characters.",
	})
	CRON_SECRET?: string;

	@IsOptional()
	@IsString()
	BLOB_READ_WRITE_TOKEN?: string;

	@IsOptional()
	@IsString()
	AI_GATEWAY_API_KEY?: string;

	@IsOptional()
	@IsString()
	VERCEL_OIDC_TOKEN?: string;

	@IsOptional()
	@IsString()
	AI_GATEWAY_SPEND_PAUSED?: string;

	@IsOptional()
	@IsUrl(
		{ require_tld: false, require_protocol: true },
		{
			message:
				"AGENT_URL must be a full URL with a scheme, like http://127.0.0.1:2000.",
		},
	)
	AGENT_URL?: string;

	@IsOptional()
	@IsString()
	AGENT_BRIDGE_SECRET?: string;

	@IsOptional()
	@IsUrl({ require_tld: false, require_protocol: true })
	LODE_WEBSITE_SUPABASE_URL?: string;

	@IsOptional()
	@IsString()
	LODE_WEBSITE_SUPABASE_SERVICE_ROLE_KEY?: string;

	@IsOptional()
	@IsString()
	LODE_WEBSITE_LEADS_TABLE?: string;

	@IsOptional()
	@IsString()
	AGENTMAIL_API_KEY?: string;

	@IsOptional()
	@IsUrl({ require_tld: false, require_protocol: true })
	AGENTMAIL_API_URL?: string;

	@IsOptional()
	@IsString()
	AGENTMAIL_INBOX_ID?: string;

	@IsOptional()
	@IsString()
	AGENTMAIL_INBOX_EMAIL?: string;

	@IsOptional()
	@IsString()
	PROVIDER_MUTATIONS_PAUSED?: string;

	@IsOptional()
	@IsString()
	OUTREACH_SENDS_PAUSED?: string;

	@IsOptional()
	@IsString()
	GRANOLA_API_KEY?: string;

	@IsOptional()
	@IsString()
	CRM_TELEMETRY_DISABLED?: string;
}

export function validateEnv(
	config: Record<string, unknown>,
): EnvironmentVariables {
	const validated = plainToInstance(EnvironmentVariables, config, {
		enableImplicitConversion: true,
		exposeDefaultValues: true,
	});

	const errors = validateSync(validated, {
		skipMissingProperties: false,
		whitelist: false,
	});
	const details = errors.map((error) =>
		Object.values(error.constraints ?? {}).join(", "),
	);
	const allowListError = validateAllowedSignIn(validated.ALLOWED_SIGN_IN);
	if (allowListError) details.push(allowListError);

	if (details.length > 0) {
		throw new Error(
			`Invalid environment configuration:\n  - ${details.join("\n  - ")}\n\nSee .env.example at the root of the repo.`,
		);
	}

	return validated;
}

function validateAllowedSignIn(value: string | undefined): string | null {
	const entries = value
		?.split(",")
		.map((entry) => entry.trim().toLowerCase())
		.filter(Boolean);
	if (!entries || entries.length === 0) {
		return "ALLOWED_SIGN_IN must contain at least one email address or domain.";
	}
	if (entries.some((entry) => !validAllowListEntry(entry))) {
		return "ALLOWED_SIGN_IN contains a malformed email address or domain.";
	}
	return null;
}

function validAllowListEntry(entry: string): boolean {
	const normalized = entry.replace(/^@/, "");
	const parts = normalized.split("@");
	if (parts.length === 1) return validHost(parts[0] ?? "");
	if (parts.length !== 2 || !parts[0]) return false;
	return /^[^\s@]+$/.test(parts[0]) && validHost(parts[1] ?? "");
}

function validHost(host: string): boolean {
	return isRegistrableWorkspaceHost(host);
}
