import { initTRPC } from "@trpc/server";
import { setResearchKeyInput } from "../src/settings/settings.contracts";
import { formatTrpcError } from "../src/trpc/error-formatter";

const t = initTRPC.create({ errorFormatter: formatTrpcError });

const router = t.router({
	setResearchKey: t.procedure.input(setResearchKeyInput).mutation(() => "ok"),
});

const server = Bun.serve({
	port: 4599,
	fetch: (req) =>
		import("@trpc/server/adapters/fetch").then(({ fetchRequestHandler }) =>
			fetchRequestHandler({
				endpoint: "",
				req,
				router,
				createContext: () => ({}),
			}),
		),
});

for (const apiKey of ["short", "ctx live key with spaces", ""]) {
	const res = await fetch(`http://localhost:4599/setResearchKey`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ apiKey }),
	});
	const body = await res.json();
	console.log(JSON.stringify(apiKey).padEnd(28), "->", body.error.message);
}

server.stop();
