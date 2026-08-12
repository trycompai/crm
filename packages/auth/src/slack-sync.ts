import { queueSlackInventorySync as queue } from "@crm/db/slack-inventory";
import { SLACK_CONNECTION } from "./slack-config";

export async function queueSlackInventorySync(): Promise<void> {
	await queue(SLACK_CONNECTION.inventory.reason);
}
