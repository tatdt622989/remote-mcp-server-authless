import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCalculatorTools } from "./calculator.js";
import { registerJapaneseVocabularyTools } from "./japanese-vocabulary.js";
import { registerAzureDevOpsTools } from "./azure-devops.js";

/**
 * 註冊所有工具到 MCP 伺服器
 */
export function registerAllTools(server: McpServer) {
	// 註冊計算器工具
	registerCalculatorTools(server);
	
	// 註冊日文單字工具
	// registerJapaneseVocabularyTools(server);
	
	// 註冊 Azure DevOps 工具
	registerAzureDevOpsTools(server);
}
