import { defineTool } from "eve/tools";
import { webFetch } from "eve/tools/web_fetch";
import { webFetchAllowed } from "../../../lib/web-policy";

export default defineTool({
	...webFetch,
	description:
		"Open one web page. Use an exact link from the user or an approved public documentation entry page.",
	execute(input, ctx) {
		if (!webFetchAllowed(input.url, ctx.messages)) {
			throw new Error(
				"That URL is not user-linked or approved documentation. Ask the user to paste the exact link.",
			);
		}
		return webFetch.execute(input, ctx);
	},
});
