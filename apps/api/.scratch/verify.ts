import "@crm/env/load";
import { ResearchKeyService } from "../src/agent/research-key.service";

const service = new ResearchKeyService();
const real = process.env.CONTEXT_DEV_API_KEY?.trim() ?? "";

console.log(
	"bad key     ->",
	JSON.stringify(await service.verify("ctx_nope_not_real_key")),
);
console.log("real key    ->", JSON.stringify(await service.verify(real)));

const secret = process.env.AGENT_BRIDGE_SECRET;
delete process.env.AGENT_BRIDGE_SECRET;
console.log("no bridge   ->", JSON.stringify(await service.verify(real)));
process.env.AGENT_BRIDGE_SECRET = secret;

process.env.AGENT_URL = "http://127.0.0.1:59999";
console.log("agent down  ->", JSON.stringify(await service.verify(real)));
