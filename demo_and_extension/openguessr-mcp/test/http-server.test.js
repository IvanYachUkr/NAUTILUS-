import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { startOpenGuessrProxyServer } from "../src/http-server.js";

test("the HTTP MCP supports discovery, calls, and a clean GET event stream", async (t) => {
  const upstream = fakeUpstream("one");
  const proxyServer = await startOpenGuessrProxyServer({
    host: "127.0.0.1",
    port: 0,
    upstreamFactory: async () => upstream,
  });
  t.after(() => proxyServer.close());

  const client = new Client({ name: "proxy-integration-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(proxyServer.url));
  await client.connect(transport);
  t.after(() => client.close());

  const listed = await client.listTools();
  const screenshot = await client.callTool({
    name: "browser_take_screenshot",
    arguments: {},
  });

  assert.deepEqual(
    listed.tools.map(({ name }) => name),
    [
      "browser_take_screenshot",
      "openguessr_place_guess",
      "openguessr_get_state",
      "openguessr_submit_guess",
      "openguessr_continue",
    ],
  );
  assert.equal(screenshot.content[0].text, "screenshot from one");
});

test("each MCP client gets an isolated upstream connection", async (t) => {
  let nextId = 0;
  const upstreams = [];
  const proxyServer = await startOpenGuessrProxyServer({
    host: "127.0.0.1",
    port: 0,
    upstreamFactory: async () => {
      const upstream = fakeUpstream(String(++nextId));
      upstreams.push(upstream);
      return upstream;
    },
  });
  t.after(() => proxyServer.close());

  const first = await connectClient(proxyServer.url, "first");
  const second = await connectClient(proxyServer.url, "second");
  t.after(() => first.close());
  t.after(() => second.close());

  const firstResult = await first.callTool({
    name: "browser_take_screenshot",
    arguments: {},
  });
  const secondResult = await second.callTool({
    name: "browser_take_screenshot",
    arguments: {},
  });

  assert.equal(firstResult.content[0].text, "screenshot from 1");
  assert.equal(secondResult.content[0].text, "screenshot from 2");
  assert.equal(upstreams.length, 2);
  assert.notEqual(first.transport.sessionId, second.transport.sessionId);
});

test("the HTTP MCP rejects browser-origin requests before creating an upstream session", async (t) => {
  let upstreamConnections = 0;
  const proxyServer = await startOpenGuessrProxyServer({
    host: "127.0.0.1",
    port: 0,
    upstreamFactory: async () => {
      upstreamConnections += 1;
      return fakeUpstream("unused");
    },
  });
  t.after(() => proxyServer.close());

  const response = await fetch(proxyServer.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://untrusted.example",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });

  assert.equal(response.status, 403);
  assert.equal(upstreamConnections, 0);
});

test("the HTTP MCP refuses a non-loopback listener", async () => {
  await assert.rejects(
    startOpenGuessrProxyServer({
      host: "0.0.0.0",
      port: 0,
      upstreamFactory: async () => fakeUpstream("unused"),
    }),
    /loopback/i,
  );
});

async function connectClient(url, name) {
  const client = new Client({ name, version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await client.connect(transport);
  return {
    transport,
    callTool: (request) => client.callTool(request),
    close: () => client.close(),
  };
}

function fakeUpstream(id) {
  return {
    closed: false,
    async listTools() {
      return {
        tools: [
          {
            name: "browser_take_screenshot",
            description: "Take a screenshot",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "browser_evaluate",
            description: "Evaluate JavaScript",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      };
    },
    async callTool({ name }) {
      if (name !== "browser_take_screenshot") throw new Error(`unexpected ${name}`);
      return { content: [{ type: "text", text: `screenshot from ${id}` }] };
    },
    async close() {
      this.closed = true;
    },
  };
}
