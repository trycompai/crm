import { loadRootEnv } from "@crm/env";
import type { NextConfig } from "next";

loadRootEnv();

const apiUrl =
	process.env.API_URL ??
	process.env.NEXT_PUBLIC_API_URL ??
	"http://localhost:3001";

// Published for the same reason as `apiUrl`: the aggregate money figures are a
// client component, and a value that lives only in the root `.env` is
// `undefined` in the bundle.
const defaultCurrency = process.env.DEFAULT_CURRENCY ?? "usd";

const nextConfig: NextConfig = {
	env: {
		NEXT_PUBLIC_API_URL: apiUrl,
		NEXT_PUBLIC_DEFAULT_CURRENCY: defaultCurrency,
	},

	transpilePackages: ["@crm/auth", "@crm/db", "@crm/telemetry", "@crm/ui"],

	serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],

	images: {
		remotePatterns: [
			{ protocol: "https", hostname: "**.blob.vercel-storage.com" },
		],
	},

	cacheComponents: true,
	partialPrefetching: true,
};

export default nextConfig;
