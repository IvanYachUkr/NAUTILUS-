import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export async function connectHttpUpstream(value) {
  const url = value instanceof URL ? value : new URL(value);
  if (!isLoopbackHostname(url.hostname)) {
    throw new Error("The Playwright MCP upstream must use a loopback URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The Playwright MCP upstream must use HTTP or HTTPS.");
  }

  const client = new Client({
    name: "nautilus-openguessr-mcp-proxy",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(url);
  await client.connect(transport);
  let closed = false;

  return {
    listTools: () => client.listTools(),
    callTool: (request) => client.callTool(request),
    async close() {
      if (closed) return;
      closed = true;
      await client.close();
    },
  };
}

function isLoopbackHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}
