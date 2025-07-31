import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Zod 驗證架構
const SearchVocabularySchema = z.object({
  keyword: z.string().min(1),
  limit: z.number().int().positive().optional(),
});

const GetRandomVocabularySchema = z.object({
  count: z.number().int().positive().optional(),
  level: z.string().optional(),
  category: z.string().optional(),
});

/**
 * 註冊日文單字相關工具
 */
export function registerJapaneseVocabularyTools(server: McpServer) {
	// 日文單字搜尋工具
	server.registerTool("search_japanese_vocabulary", {
		title: "日文單字搜尋",
		description: "根據關鍵字搜尋日文單字資料庫，支援日文或中文關鍵字搜尋",
		inputSchema: {
			keyword: SearchVocabularySchema.shape.keyword,
			limit: SearchVocabularySchema.shape.limit,
		},
	}, async (args) => {
		const { keyword, limit = 10 } = SearchVocabularySchema.parse(args);
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

			const data = await response.json() as { success?: boolean; data?: { [key: string]: any[] } };
			
			if (!data || !data.success || !data.data) {
				return {
					content: [
						{
							type: "text",
							text: "未找到相關的日文單字資料",
						},
					],
				};
			}

			// 扁平化所有級別的資料
			const allResults: any[] = [];
			Object.values(data.data).forEach(levelData => {
				if (Array.isArray(levelData)) {
					allResults.push(...levelData);
				}
			});

			if (allResults.length === 0) {
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
			const formattedResults = formatVocabularyResults(allResults, `找到 ${allResults.length} 個與「${keyword}」相關的日文單字：\n\n`);

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
	});

	// 隨機取得日文單字工具
	server.registerTool("get_random_japanese_vocabulary", {
		title: "隨機日文單字",
		description: "隨機取得日文單字用於學習練習，可依級別和分類篩選",
		inputSchema: {
			count: GetRandomVocabularySchema.shape.count,
			level: GetRandomVocabularySchema.shape.level,
			category: GetRandomVocabularySchema.shape.category,
		},
	}, async (args) => {
		const { count = 5, level, category } = GetRandomVocabularySchema.parse(args);
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

			const data = await response.json() as { success?: boolean; data?: { [key: string]: any[] } };
			
			if (!data || !data.success || !data.data) {
				return {
					content: [
						{
							type: "text",
							text: "無法取得隨機日文單字資料",
						},
					],
				};
			}

			// 扁平化所有級別的資料
			const allResults: any[] = [];
			Object.values(data.data).forEach(levelData => {
				if (Array.isArray(levelData)) {
					allResults.push(...levelData);
				}
			});

			if (allResults.length === 0) {
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
			let prefix = `隨機取得 ${allResults.length} 個日文單字`;
			if (level) prefix += ` (${level} 級別)`;
			if (category) prefix += ` (${category} 分類)`;
			prefix += "：\n\n";

			const formattedResults = formatVocabularyResults(allResults, prefix);

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
	});
}

/**
 * 格式化單字結果的共用函數
 */
function formatVocabularyResults(results: any[], prefix: string): string {
	let formattedResults = prefix;
	
	results.forEach((vocab: any, index: number) => {
		formattedResults += `${index + 1}. **${vocab.japanese || vocab.word}**\n`;
		if (vocab.kana && vocab.kana !== vocab.japanese) formattedResults += `   かな: ${vocab.kana}\n`;
		if (vocab.reading && vocab.reading !== vocab.kana) formattedResults += `   読み: ${vocab.reading}\n`;
		if (vocab.chinese || vocab.meaning) formattedResults += `   中文: ${vocab.chinese || vocab.meaning}\n`;
		if (vocab.partOfSpeech) formattedResults += `   品詞: ${vocab.partOfSpeech}\n`;
		if (vocab.category) formattedResults += `   分類: ${vocab.category}\n`;
		if (vocab.examples && Array.isArray(vocab.examples) && vocab.examples.length > 0) {
			formattedResults += `   例文:\n`;
			vocab.examples.slice(0, 2).forEach((example: any, exIndex: number) => {
				if (example.japanese) formattedResults += `     ${exIndex + 1}. ${example.japanese}\n`;
				if (example.chinese) formattedResults += `        ${example.chinese}\n`;
			});
		}
		formattedResults += "\n";
	});

	return formattedResults;
}
