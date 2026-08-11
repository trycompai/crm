import "@crm/env/load";

import { PrismaPg } from "@prisma/adapter-pg";
import { type Prisma, PrismaClient } from "./generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
const databaseCaCert = process.env.DATABASE_CA_CERT?.replaceAll("\\n", "\n");

if (!connectionString) {
	throw new Error(
		"DATABASE_URL is not set. Copy .env.example to .env at the root of the repo and fill it in, or set DATABASE_URL in the environment.",
	);
}

export interface PrismaLogRecord {
	level: Prisma.LogLevel;
	message: string;
	target: string;
	durationMs?: number;
}

export type PrismaLogSink = (record: PrismaLogRecord) => void;

const consoleSink: PrismaLogSink = ({ level, message, target, durationMs }) => {
	const suffix = durationMs === undefined ? "" : ` (+${durationMs}ms)`;
	const line = `[prisma:${level}] ${message}${suffix} [${target}]`;

	if (level === "error") {
		console.error(line);
	} else if (level === "warn") {
		console.warn(line);
	} else {
		console.log(line);
	}
};

let sink: PrismaLogSink = consoleSink;

export function setPrismaLogSink(next: PrismaLogSink | null): void {
	sink = next ?? consoleSink;
}

const logQueries = process.env.PRISMA_LOG_QUERIES === "true";

const logDefinitions: Prisma.LogDefinition[] = [
	{ level: "warn", emit: "event" },
	{ level: "error", emit: "event" },
	...(logQueries
		? ([
				{ level: "query", emit: "event" },
				{ level: "info", emit: "event" },
			] satisfies Prisma.LogDefinition[])
		: []),
];

const createPrismaClient = () => {
	const adapterConfig = databaseCaCert
		? (() => {
				const url = new URL(connectionString);
				url.searchParams.delete("sslmode");
				url.searchParams.delete("sslcert");
				url.searchParams.delete("sslkey");
				url.searchParams.delete("sslrootcert");
				return {
					connectionString: url.toString(),
					ssl: { ca: databaseCaCert, rejectUnauthorized: true },
				};
			})()
		: { connectionString };
	const client = new PrismaClient({
		adapter: new PrismaPg(adapterConfig),
		log: logDefinitions,
	});

	client.$on("error", ({ message, target }) => {
		sink({ level: "error", message, target });
	});
	client.$on("warn", ({ message, target }) => {
		sink({ level: "warn", message, target });
	});
	client.$on("info", ({ message, target }) => {
		sink({ level: "info", message, target });
	});
	client.$on("query", ({ query, duration, target }) => {
		sink({ level: "query", message: query, target, durationMs: duration });
	});

	return client;
};

const globalForPrisma = globalThis as unknown as {
	prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = db;
}

export type Db = typeof db;
