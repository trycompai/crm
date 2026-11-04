# Add SpecStream as an MCP vendor

I make SpecStream (https://specstream.ai/?utm_source=crm), so I'm biased.
You ask it for data in plain words and it returns rows from the live web, each value with its source URL.

What made me notice: the CRM agent researches one person or company at a time (`context-dev.ts`, `perplexity.ts`).
That breaks down on a whole list, like "200 seed stage fintechs in Germany that hired a head of sales this quarter".
Every row must meet the conditions and every fact needs its page, so a rep can open row 147 without trusting the agent.

What I'd do: add `packages/mcp-integrations/src/vendors/specstream.ts` and one line in `vendors/index.ts`, shaped like Linear and Notion.
The remote MCP (https://api.specstream.ai/mcp, OAuth with dynamic client registration) passes your `McpOAuthClient.discover`.
`finds:spend` is only in read-write, and tools that start paid work or send data out are in `riskyTools`, so each deployed agent needs an explicit grant.

What it breaks: nothing, it's additive.
One more vendor on Connections, and usage is billed to the user's own SpecStream account; the CRM pays nothing.
The PR has the code (two small files and a test), happy to drop it if you'd rather settle the idea first.
