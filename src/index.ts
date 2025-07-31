import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "./tools/index.js";

// Global variable to store the current request for tools to access
let currentRequest: Request | null = null;
let deploymentVersion: string = "1.0.0"; // 用於追蹤部署版本

// Export function to get current request headers
export function getCurrentRequestHeaders(): Headers {
	if (!currentRequest) {
		// Return empty Headers object if no request is in flight.
		return new Headers();
	}
	return currentRequest.headers;
}

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Calculator, Japanese Vocabulary & Azure DevOps Tools",
		version: "1.0.0",
	});

	async init() {
		// 註冊所有工具
		registerAllTools(this.server);
	}

	async onSSEMcpMessage(sessionId: string, request: Request): Promise<Error | null> {
		// Store the current request so tools can access headers
		currentRequest = request;
		
		try {
			// Call the parent method to handle MCP messages
			return await super.onSSEMcpMessage(sessionId, request);
		} catch (error) {
			console.error('❌ SSE 處理錯誤:', error);
			return error instanceof Error ? error : new Error(String(error));
		}
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		try {
			// 記錄收到的 headers 以便調試
			console.log('📥 收到的 request on path:', url.pathname);
			request.headers.forEach((value, key) => {
				console.log(`  ${key}: ${value}`);
			});

			// MCP 協議通常使用 SSE (Server-Sent Events) 或 WebSocket
			// SSE endpoint for MCP agent, 包含 Durable Object binding
			if (url.pathname === "/sse" || url.pathname === "/sse/message") {
				console.log('🔗 處理 SSE 連線請求');
				return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
			}

			// REST API endpoint for MCP agent, 包含 Durable Object binding
			if (url.pathname === "/mcp") {
				console.log('🔗 處理 MCP REST 請求');
				return MyMCP.serve("/mcp").fetch(request, env, ctx);
			}

			// 健康檢查端點
			if (url.pathname === "/health") {
				return new Response(JSON.stringify({
					status: "ok",
					timestamp: new Date().toISOString(),
					version: "1.0.0"
				}), {
					headers: { "Content-Type": "application/json" }
				});
			}

			return new Response("Not found", { status: 404 });
		} catch (error) {
			console.error('❌ 請求處理錯誤:', error);
			return new Response(JSON.stringify({
				error: "Internal Server Error",
				message: error instanceof Error ? error.message : String(error)
			}), {
				status: 500,
				headers: { "Content-Type": "application/json" }
			});
		}
	},
};
