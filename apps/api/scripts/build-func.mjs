import { execSync, spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(apiDir));
const outDir = join(repoRoot, ".vercel/output");
const funcDir = join(outDir, "functions/api/index.func");
const bun = process.env.BUN_BIN || "bun";

const EXTERNALS = [
	"@nestjs/microservices",
	"@nestjs/websockets",
	"@nestjs/platform-fastify",
	"@nestjs/graphql",
	"@nestjs/swagger",
	"class-transformer/storage",
	"pg-native",
	"better-sqlite3",
	"cardinal",
];

const VENDOR_ROOTS = ["express"];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(funcDir, { recursive: true });

console.log("• bundling function with bun build...");
execSync(
	[
		`${bun} build api/index.ts`,
		"--target=node",
		"--format=esm",
		`--outfile=${JSON.stringify(join(funcDir, "index.mjs"))}`,
		...EXTERNALS.map((e) => `--external ${e}`),
	].join(" "),
	{
		cwd: apiDir,
		stdio: "inherit",
		env: { ...process.env, NODE_ENV: "production" },
	},
);

console.log("• pinning NODE_ENV in the bundle...");
const entry = join(funcDir, "index.mjs");
writeFileSync(
	entry,
	`process.env.NODE_ENV ??= "production";\n${readFileSync(entry, "utf8")}`,
);

console.log("• vendoring runtime-resolved dependencies...");
const bunStore = join(repoRoot, "node_modules/.bun");
const stores = existsSync(bunStore) ? readdirSync(bunStore) : [];
const funcNm = join(funcDir, "node_modules");
mkdirSync(funcNm, { recursive: true });
let vendorCount = 0;

function findInStore(name) {
	const enc = name.replace(/\//g, "+");
	for (const d of stores.filter((s) => s.startsWith(`${enc}@`))) {
		const p = join(bunStore, d, "node_modules", name);
		if (existsSync(p)) return p;
	}
	return null;
}

function packageVersion(dir) {
	try {
		return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
	} catch {
		return null;
	}
}

function resolveDep(realDir, name, depName) {
	const storeNm = realDir.slice(0, realDir.length - name.length);
	const candidate = join(storeNm, depName);
	if (existsSync(candidate)) return realpathSync(candidate);
	return findInStore(depName);
}

function place(realDir, dest) {
	mkdirSync(dirname(dest), { recursive: true });
	cpSync(realDir, dest, { recursive: true, dereference: true });
	vendorCount++;
}

function vendorDeps(realDir, name, placedDir) {
	let pj;
	try {
		pj = JSON.parse(readFileSync(join(realDir, "package.json"), "utf8"));
	} catch {
		return;
	}
	for (const depName of Object.keys(pj.dependencies || {})) {
		const depReal = resolveDep(realDir, name, depName);
		if (!depReal) {
			console.warn(`  ! not found: ${depName} (needed by ${name})`);
			continue;
		}
		vendor(depName, depReal, placedDir);
	}
}

function vendor(name, realDir, dependentDir) {
	const rootDest = join(funcNm, name);
	if (!existsSync(rootDest)) {
		place(realDir, rootDest);
		vendorDeps(realDir, name, rootDest);
		return;
	}
	if (packageVersion(rootDest) === packageVersion(realDir)) return;
	const nested = join(dependentDir, "node_modules", name);
	if (existsSync(nested)) return;
	place(realDir, nested);
	vendorDeps(realDir, name, nested);
}

for (const root of VENDOR_ROOTS) {
	const dir = findInStore(root);
	if (!dir) {
		console.warn(`  ! not found: ${root}`);
		continue;
	}
	vendor(root, realpathSync(dir), funcNm);
}
console.log(`  vendored ${vendorCount} packages`);

writeFileSync(
	join(funcDir, "package.json"),
	JSON.stringify({ type: "module" }),
);
writeFileSync(
	join(funcDir, ".vc-config.json"),
	JSON.stringify({
		runtime: "nodejs22.x",
		handler: "index.mjs",
		launcherType: "Nodejs",
		shouldAddHelpers: false,
		maxDuration: 60,
		memory: 1769,
		environment: { NODE_ENV: "production" },
		regions: ["iad1"],
	}),
);
writeFileSync(
	join(outDir, "config.json"),
	JSON.stringify({
		version: 3,
		routes: [{ src: "/(.*)", dest: "/api/index" }],
		crons: [{ path: "/internal/sync/google", schedule: "*/5 * * * *" }],
	}),
);

console.log(`✓ built ${outDir}`);

const isProductionDeployment = process.env.VERCEL_ENV === "production";

const directDatabaseUrl = !isProductionDeployment
	? undefined
	: process.env.DIRECT_DATABASE_URL ||
		process.env.POSTGRES_URL_NON_POOLING ||
		process.env.DATABASE_URL_UNPOOLED ||
		process.env.DATABASE_URL;

if (!process.env.VERCEL) {
	console.log("• not a Vercel build — skipping migrations");
} else if (!isProductionDeployment) {
	console.log(
		`• ${process.env.VERCEL_ENV || "non-production"} deployment — skipping migrations, only production applies them`,
	);
} else if (!directDatabaseUrl) {
	console.log("• no database URL at build time — skipping migrations");
} else {
	const dbDir = join(repoRoot, "packages/db");
	const dbEnv = { ...process.env, DATABASE_URL: directDatabaseUrl };

	console.log("• applying migrations (prisma migrate deploy)...");
	execSync(`${bun} x prisma migrate deploy`, {
		cwd: dbDir,
		stdio: "inherit",
		env: dbEnv,
	});
	console.log("✓ migrations applied");

	console.log("• checking the deployed schema against schema.prisma...");
	const drift = spawnSync(
		bun,
		[
			"x",
			"prisma",
			"migrate",
			"diff",
			"--from-config-datasource",
			"--to-schema",
			join("prisma", "schema.prisma"),
			"--exit-code",
		],
		{ cwd: dbDir, encoding: "utf8", env: dbEnv },
	);

	if (drift.status === 0) {
		console.log("✓ schema matches");
	} else if (drift.status === 2) {
		console.log("");
		console.log("!!  THE PRODUCTION SCHEMA DOES NOT MATCH schema.prisma  !!");
		console.log(
			"    Every migration is recorded as applied, so `migrate deploy` will keep reporting",
		);
		console.log(
			"    nothing pending while queries fail on columns that are not there. Reconcile with",
		);
		console.log(
			"    `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`.",
		);
		console.log("");
		console.log(drift.stdout || "");
	} else {
		console.log(
			`• could not compare the schema (${drift.stderr?.trim() || "unknown error"})`,
		);
	}
}
