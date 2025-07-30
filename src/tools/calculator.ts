import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * 註冊計算器工具
 */
export function registerCalculatorTools(server: McpServer) {
	// 加法工具
	server.tool(
		"add",
		{
			a: z.number().describe("第一個數字"),
			b: z.number().describe("第二個數字"),
		},
		async ({ a, b }: { a: number; b: number }) => {
			const result = a + b;
			return {
				content: [
					{
						type: "text",
						text: `${a} + ${b} = ${result}`,
					},
				],
			};
		}
	);

	// 通用計算工具
	server.tool(
		"calculate",
		{
			expression: z.string().describe("要計算的數學表達式 (如: 2 + 3 * 4)"),
		},
		async ({ expression }: { expression: string }) => {
			try {
				// 基本的安全性檢查：只允許數字、運算符號和空格
				if (!/^[\d\+\-\*\/\(\)\s\.]+$/.test(expression)) {
					return {
						content: [
							{
								type: "text",
								text: "錯誤：表達式包含無效字符",
							},
						],
					};
				}

				// 使用 Function 構造函數來安全地評估表達式
				const result = Function(`"use strict"; return (${expression})`)();
				
				return {
					content: [
						{
							type: "text",
							text: `${expression} = ${result}`,
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `計算錯誤：${error instanceof Error ? error.message : '無效的表達式'}`,
						},
					],
				};
			}
		}
	);
}
