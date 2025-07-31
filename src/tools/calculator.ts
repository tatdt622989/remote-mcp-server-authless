import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Zod 驗證架構
const AddSchema = z.object({
  a: z.number(),
  b: z.number(),
});

const CalculateSchema = z.object({
  expression: z.string().min(1),
});

/**
 * 註冊計算器工具
 */
export function registerCalculatorTools(server: McpServer) {
	// 加法工具
	server.registerTool("add", {
		title: "數字加法計算",
		description: "將兩個數字相加並返回結果",
		inputSchema: {
			a: AddSchema.shape.a,
			b: AddSchema.shape.b,
		},
	}, async (args) => {
		const { a, b } = AddSchema.parse(args);
		const result = a + b;
		return {
			content: [
				{
					type: "text",
					text: `${a} + ${b} = ${result}`,
				},
			],
		};
	});

}
