import { DefaultSandbox, defineSandbox } from "eve/sandbox";
import { denySandboxNetwork } from "../../../lib/sandbox-network";

export const environment = DefaultSandbox.environment({
	vercel: { networkPolicy: "deny-all" },
});

export default defineSandbox(async () =>
	denySandboxNetwork(await environment.open()),
);
