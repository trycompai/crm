import { defineHook } from "eve/hooks";
import { assertModelSpendAllowed } from "../lib/autonomy";

export default defineHook({
	events: {
		"step.started"() {
			assertModelSpendAllowed();
		},
	},
});
