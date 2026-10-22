import { defineTool } from "eve/tools";
import { z } from "zod";
import { refuseWebSearch } from "../lib/web-policy";

export default defineTool({
	description:
		"Search is unavailable in workspace chats. Use approved documentation or request an exact link.",
	inputSchema: z.object({ query: z.string() }),
	execute: refuseWebSearch,
});
