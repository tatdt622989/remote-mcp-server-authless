import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * 註冊日文單字相關工具
 */
export function registerJapaneseVocabularyTools(server: McpServer) {
	// 日文單字搜尋工具
	server.tool(
		"search_japanese_vocabulary",
		{
			keyword: z.string().describe("要搜尋的日文單字或中文關鍵字"),
			limit: z.number().optional().describe("回傳結果數量限制，預設為10"),
		},
		async ({ keyword, limit = 10 }: { keyword: string; limit?: number }) => {
			try {
				const url = new URL("https://ai-tutor.6yuwei.com/api/vocabulary");
				url.searchParams.append("keyword", keyword);
				url.searchParams.append("limit", limit.toString());

				const response = await fetch(url.toString());
				
				if (!response.ok) {
					return {
						content: [
							{
								type: "text",
								text: `API 錯誤: ${response.status} ${response.statusText}`,
							},
						],
					};
				}

				const data = await response.json() as { results?: any[] };
				
				if (!data || !Array.isArray(data.results)) {
					return {
						content: [
							{
								type: "text",
								text: "未找到相關的日文單字資料",
							},
						],
					};
				}

				if (data.results.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: `未找到與「${keyword}」相關的日文單字`,
							},
						],
					};
				}

				// Format the vocabulary results
				const formattedResults = formatVocabularyResults(data.results, `找到 ${data.results.length} 個與「${keyword}」相關的日文單字：\n\n`);

				return {
					content: [
						{
							type: "text",
							text: formattedResults,
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `搜尋日文單字時發生錯誤: ${error instanceof Error ? error.message : '未知錯誤'}`,
						},
					],
				};
			}
		}
	);

	// 隨機取得日文單字工具
	server.tool(
		"get_random_japanese_vocabulary",
		{
			count: z.number().optional().describe("要取得的隨機單字數量，預設為5"),
			level: z.string().optional().describe("單字級別篩選 (如: N5, N4, N3, N2, N1)"),
			category: z.string().optional().describe("單字分類篩選"),
		},
		async ({ count = 5, level, category }: { count?: number; level?: string; category?: string }) => {
			try {
				const url = new URL("https://ai-tutor.6yuwei.com/api/vocabulary");
				url.searchParams.append("random", "true");
				url.searchParams.append("limit", count.toString());
				
				if (level) url.searchParams.append("level", level);
				if (category) url.searchParams.append("category", category);

				const response = await fetch(url.toString());
				
				if (!response.ok) {
					return {
						content: [
							{
								type: "text",
								text: `API 錯誤: ${response.status} ${response.statusText}`,
							},
						],
					};
				}

				const data = await response.json() as { results?: any[] };
				
				if (!data || !Array.isArray(data.results)) {
					return {
						content: [
							{
								type: "text",
								text: "無法取得隨機日文單字資料",
							},
						],
					};
				}

				if (data.results.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: "未找到符合條件的日文單字",
							},
						],
					};
				}

				// Format the random vocabulary results
				let prefix = `隨機取得 ${data.results.length} 個日文單字`;
				if (level) prefix += ` (${level} 級別)`;
				if (category) prefix += ` (${category} 分類)`;
				prefix += "：\n\n";

				const formattedResults = formatVocabularyResults(data.results, prefix);

				return {
					content: [
						{
							type: "text",
							text: formattedResults,
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `取得隨機日文單字時發生錯誤: ${error instanceof Error ? error.message : '未知錯誤'}`,
						},
					],
				};
			}
		}
	);
}

/**
 * 格式化單字結果的共用函數
 */
function formatVocabularyResults(results: any[], prefix: string): string {
	let formattedResults = prefix;
	
	results.forEach((vocab: any, index: number) => {
		formattedResults += `${index + 1}. **${vocab.word || vocab.japanese}**\n`;
		if (vocab.hiragana) formattedResults += `   ひらがな: ${vocab.hiragana}\n`;
		if (vocab.katakana) formattedResults += `   カタカナ: ${vocab.katakana}\n`;
		if (vocab.chinese || vocab.meaning) formattedResults += `   中文: ${vocab.chinese || vocab.meaning}\n`;
		if (vocab.english) formattedResults += `   英文: ${vocab.english}\n`;
		if (vocab.pronunciation) formattedResults += `   發音: ${vocab.pronunciation}\n`;
		if (vocab.level) formattedResults += `   級別: ${vocab.level}\n`;
		if (vocab.category) formattedResults += `   分類: ${vocab.category}\n`;
		formattedResults += "\n";
	});

	return formattedResults;
}