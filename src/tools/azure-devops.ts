import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCurrentRequestHeaders } from "../index.js";

// Azure DevOps 配置類型
interface AzureDevOpsConfig {
  pat: string;
  orgUrl: string;
  project?: string;
}

// 使用者驗證資訊
interface UserProfile {
  id: string;
  displayName: string;
  emailAddress: string;
  descriptor: string;
}

// Azure DevOps Work Item 類型定義
interface WorkItem {
  id: number;
  rev: number;
  fields: {
    "System.Id": number;
    "System.Title": string;
    "System.WorkItemType": string;
    "System.State": string;
    "System.AssignedTo"?: {
      displayName: string;
      uniqueName: string;
    };
    "System.CreatedBy": {
      displayName: string;
      uniqueName: string;
    };
    "System.CreatedDate": string;
    "System.ChangedDate": string;
    "System.Description"?: string;
    "Microsoft.VSTS.Common.Priority"?: number;
    "Microsoft.VSTS.Common.Severity"?: string;
    "System.Tags"?: string;
    [key: string]: any;
  };
  relations?: Array<{
    rel: string;
    url: string;
  }>;
  url: string;
}

// 配置常數
const MAX_RECURSION_DEPTH = 3;
const MAX_VISITED_ITEMS = 10;
const MAX_PARENT_RELATIONS = 3;
const API_DELAY_MS = 200;
const QUERY_TIMEOUT_MS = 30000;

/**
 * Azure DevOps 服務類
 */
class AzureDevOpsService {
  private config: AzureDevOpsConfig;

  constructor(config: AzureDevOpsConfig) {
    this.config = config;
  }

  /**
   * 驗證使用者身份和 PAT 有效性
   */
  async validateUser(): Promise<UserProfile> {
    this.validateConfig();

    try {
      // 使用 Azure DevOps REST API 來驗證使用者身份
      // 先嘗試取得組織資訊來驗證 PAT 和存取權限
      const orgUrl = `${this.config.orgUrl}/_apis/connectionData?api-version=6.0-preview`;
      const response = await fetch(orgUrl, {
        method: "GET",
        headers: this.getAuthHeaders(),
      });

      console.log(`🔐 驗證使用者身份 - 狀態: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401) {
          if (errorText.includes("expired") || errorText.includes("Personal Access Token used has expired")) {
            throw new Error("Azure DevOps Personal Access Token (PAT) 已過期，請更新您的 PAT");
          }
          throw new Error("Azure DevOps 驗證失敗，PAT 無效或權限不足");
        } else if (response.status === 403) {
          throw new Error("Azure DevOps 存取被拒絕，請檢查 PAT 權限設定");
        }
        throw new Error(`Azure DevOps 驗證失敗: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const connectionData = await response.json() as any;
      
      // 從 connectionData 中提取使用者資訊
      const authenticatedUser = connectionData.authenticatedUser;
      if (!authenticatedUser) {
        throw new Error("無法取得使用者資訊");
      }

      const userProfile: UserProfile = {
        id: authenticatedUser.id || authenticatedUser.descriptor || 'unknown',
        displayName: authenticatedUser.displayName || authenticatedUser.providerDisplayName || 'Unknown User',
        emailAddress: authenticatedUser.properties?.Account?.$value || 'unknown@email.com',
        descriptor: authenticatedUser.descriptor || 'unknown'
      };

      console.log(`✅ 使用者驗證成功: ${userProfile.displayName} (${userProfile.emailAddress})`);
      return userProfile;
    
    } catch (error) {
      console.error("❌ 使用者驗證失敗:", error instanceof Error ? error.message : String(error));
      throw new Error(`使用者驗證失敗: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 驗證配置是否完整
   */
  private validateConfig(): void {
    if (!this.config.pat || !this.config.orgUrl) {
      const errorMsg = "Azure DevOps 配置不完整，請檢查 headers 或環境變數。";
      console.error(`❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }

  /**
   * 建構 API URL
   */
  private buildApiUrl(workItemId: number, includeRelations = false): string {
    const baseUrl = this.config.project 
      ? `${this.config.orgUrl}/${this.config.project}/_apis/wit/workitems/${workItemId}`
      : `${this.config.orgUrl}/_apis/wit/workitems/${workItemId}`;
    
    const expand = includeRelations ? '?$expand=relations&api-version=7.0' : '?api-version=7.0';
    return baseUrl + expand;
  }

  /**
   * 建構 Web UI URL
   */
  private buildWebUrl(workItemId: number): string {
    // 從 orgUrl 中移除可能的尾隨斜線
    const baseOrgUrl = this.config.orgUrl.replace(/\/$/, '');
    
    if (this.config.project) {
      return `${baseOrgUrl}/${this.config.project}/_workitems/edit/${workItemId}/`;
    } else {
      // 如果沒有專案，使用預設格式
      return `${baseOrgUrl}/_workitems/edit/${workItemId}/`;
    }
  }

  /**
   * 建構授權標頭
   */
  private getAuthHeaders(): HeadersInit {
    return {
      "Authorization": `Basic ${btoa(`:${this.config.pat}`)}`,
      "Accept": "application/json",
    };
  }

  /**
   * 記錄 API 調用
   */
  private logApiCall(method: string, url: string, workItemId: number, status: number): void {
    console.log(`📡 ${method} ${url} - 工作事項 ${workItemId} - 狀態: ${status}`);
  }

  /**
   * 驗證工作事項 ID 是否有效
   */
  private isValidWorkItemId(id: number): boolean {
    return Number.isInteger(id) && id > 0 && id <= 999999;
  }

  /**
   * 格式化日期
   */
  private formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Taipei'
      });
    } catch {
      return dateString;
    }
  }

  /**
   * 格式化描述
   */
  private formatDescription(description?: string): string {
    if (!description) return "無描述";
    const cleanText = description.replace(/<[^>]*>/g, '');
    return cleanText.length > 500 ? cleanText.substring(0, 500) + "..." : cleanText;
  }

  /**
   * 調用 Azure DevOps API 取得工作事項
   */
  async getWorkItem(workItemId: number): Promise<WorkItem> {
    this.validateConfig();
    try {
      const url = this.buildApiUrl(workItemId);
      const response = await fetch(url, {
        method: "GET",
        headers: this.getAuthHeaders(),
      });
      this.logApiCall('GET', url, workItemId, response.status);
      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 404) throw new Error(`工作事項 ${workItemId} 不存在`);
        if (response.status === 401) {
          if (errorText.includes("expired")) throw new Error("Azure DevOps PAT 已過期");
          throw new Error("Azure DevOps 驗證失敗，請檢查 PAT 權限");
        }
        throw new Error(`Azure DevOps API 錯誤: ${response.status} ${response.statusText}`);
      }
      return await response.json() as WorkItem;
    } catch (error) {
      console.error("❌ 取得工作事項失敗:", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * 遞迴查詢工作事項的上層 Feature 或 Epic
   */
  async findParentFeature(workItemId: number, visited = new Set<number>(), depth = 0): Promise<WorkItem | null> {
    if (visited.has(workItemId) || depth > MAX_RECURSION_DEPTH || visited.size > MAX_VISITED_ITEMS || !this.isValidWorkItemId(workItemId)) {
      return null;
    }
    visited.add(workItemId);

    try {
      if (depth > 0) await new Promise(resolve => setTimeout(resolve, API_DELAY_MS));
      
      const url = this.buildApiUrl(workItemId, true);
      const response = await fetch(url, {
        method: "GET",
        headers: this.getAuthHeaders(),
      });
      this.logApiCall('GET', url, workItemId, response.status);

      if (!response.ok) return null;

      const workItem = await response.json() as WorkItem;
      const workItemType = workItem.fields["System.WorkItemType"];

      if (workItemType === "Feature" || workItemType === "Epic") {
        return workItem;
      }

      if (workItem.relations) {
        for (const relation of workItem.relations) {
          if (relation.rel === "System.LinkTypes.Hierarchy-Reverse") {
            const parentIdMatch = relation.url.match(/workItems\/(\d+)$/);
            if (parentIdMatch) {
              const parentId = parseInt(parentIdMatch[1]);
              const parentFeature = await this.findParentFeature(parentId, visited, depth + 1);
              if (parentFeature) return parentFeature;
            }
          }
        }
      }
      return null;
    } catch (error) {
      console.error(`❌ 查詢工作事項 ${workItemId} 失敗:`, error);
      return null;
    }
  }

  /**
   * 格式化工作事項資訊
   */
  formatWorkItem(workItem: WorkItem): string {
    const fields = workItem.fields;
    const workItemId = fields["System.Id"] || workItem.id;
    const webUrl = this.buildWebUrl(workItemId);
    
    let result = `**🎯 工作事項 #${workItemId}**\n\n`;
    result += `**📝 標題**: ${fields["System.Title"]}\n`;
    result += `**🏷️ 類型**: ${fields["System.WorkItemType"]}\n`;
    result += `**📊 狀態**: ${fields["System.State"]}\n`;
    result += `**👤 指派給**: ${fields["System.AssignedTo"]?.displayName || '未指派'}\n`;
    result += `**👨‍💻 建立者**: ${fields["System.CreatedBy"].displayName}\n`;
    result += `**📅 建立日期**: ${this.formatDate(fields["System.CreatedDate"])}\n`;
    result += `\n**📄 描述**:\n${this.formatDescription(fields["System.Description"])}`;
    result += `\n\n**🔗 連結**: [在 Azure DevOps 中檢視](${webUrl})\n`;
    return result;
  }

  /**
   * 格式化上層 Feature/Epic
   */
  formatParentFeature(feature: WorkItem): string {
    const fields = feature.fields;
    const featureId = fields["System.Id"] || feature.id;
    const webUrl = this.buildWebUrl(featureId);
    
    let result = `**🎯 找到上層 ${fields["System.WorkItemType"]}**\n\n`;
    result += `**📝 ID**: ${featureId}\n`;
    result += `**📝 標題**: ${fields["System.Title"]}\n`;
    result += `**📊 狀態**: ${fields["System.State"]}\n`;
    result += `**👤 指派給**: ${fields["System.AssignedTo"]?.displayName || '未指派'}\n`;
    result += `\n**🔗 連結**: [在 Azure DevOps 中檢視](${webUrl})\n`;
    return result;
  }
}

/**
 * 從請求 headers 中提取 Azure DevOps 配置
 */
function extractAzureDevOpsConfig(): AzureDevOpsConfig {
  const headers = getCurrentRequestHeaders();
  
  const pat = headers.get('x-azure-devops-pat') || headers.get('X-Azure-DevOps-PAT');
  const orgUrl = headers.get('x-azure-devops-org-url') || headers.get('X-Azure-DevOps-Org-URL');
  const project = headers.get('x-azure-devops-project') || headers.get('X-Azure-DevOps-Project');

  if (!pat || !orgUrl) {
    throw new Error("Azure DevOps PAT 和組織 URL 是必需的。");
  }

  return {
    pat,
    orgUrl,
    project: project || undefined,
  };
}

/**
 * 註冊 Azure DevOps 工具到 MCP 伺服器
 */
export function registerAzureDevOpsTools(server: McpServer) {
  // 註冊使用者驗證工具
  server.registerTool(
    "validate_azure_devops_user",
    {
      title: "驗證 Azure DevOps 使用者",
      description: `驗證 Azure DevOps 使用者身份和 PAT (Personal Access Token) 有效性，確認連線狀態。

🎯 **使用情境**：
• 首次設定或使用 Azure DevOps 功能時
• 遇到權限錯誤或連線問題時
• 用戶詢問「我的 Azure DevOps 設定正確嗎？」
• 需要確認目前登入的使用者身份時
• PAT 可能過期或無效時
• 用戶回報無法存取工作事項時
• 設定新環境或切換帳號後
• 用戶提到「驗證」、「登入」、「權限」、「連線」等問題時

🔧 **觸發關鍵字**：驗證、登入、權限、連線、設定、PAT、token、身份、帳號`,
      inputSchema: {},
    },
    async () => {
      try {
        const config = extractAzureDevOpsConfig();
        const service = new AzureDevOpsService(config);
        const userProfile = await service.validateUser();
        
        const result = `✅ **Azure DevOps 使用者驗證成功**\n\n` +
                      `**👤 使用者名稱**: ${userProfile.displayName}\n` +
                      `**📧 電子郵件**: ${userProfile.emailAddress}\n` +
                      `**🆔 使用者 ID**: ${userProfile.id}\n`;
        
        return { content: [{ type: "text", text: result }] };
      } catch (error) {
        return { content: [{ type: "text", text: `驗證失敗: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  // 註冊取得工作事項工具
  server.registerTool(
    "get_work_item",
    {
      title: "取得工作事項詳細資訊",
      description: `根據工作事項編號取得 Azure DevOps 工作事項的詳細資訊，並自動查詢上層 Feature/Epic。

🎯 **使用情境**：
• 當用戶提到工作事項編號、票號、Task ID、Bug ID 時
• 看到 Git commit 訊息包含 #12345、[12345]、WI-12345 等格式時
• 需要查看工作進度、指派人員、工作狀態時
• 想了解某個任務屬於哪個功能或專案時
• 協助分析程式碼變更與工作事項的關聯時
• 用戶詢問「這個 issue 的詳細資訊」、「幫我查一下這個工作」時

💡 **識別關鍵字**：工作事項、任務、票、issue、bug、story、task、工作編號、ID`,
      inputSchema: {
        work_item_id: z.number().int().positive().describe("工作事項編號 (通常是5位數字，可從Git commit訊息、PR標題、或用戶對話中提取)"),
      },
    },
    async ({ work_item_id }) => {
      try {
        const config = extractAzureDevOpsConfig();
        const service = new AzureDevOpsService(config);
        
        // 取得工作事項詳情
        const workItem = await service.getWorkItem(work_item_id);
        let result = service.formatWorkItem(workItem);
        
        // 查詢上層 Feature/Epic
        const parentFeature = await service.findParentFeature(work_item_id);
        if (parentFeature) {
          result += `\n\n` + service.formatParentFeature(parentFeature);
        } else {
          result += `\n\n**⬆️ 上層**: 無上層 Feature 或 Epic\n`;
        }
        
        return { 
          content: [{ 
            type: "text", 
            text: result
          }] 
        };
      } catch (error) {
        return { 
          content: [{ 
            type: "text", 
            text: `錯誤: ${error instanceof Error ? error.message : String(error)}` 
          }], 
          isError: true 
        };
      }
    }
  );

  // 註冊查詢上層 Feature/Epic 工具
  server.registerTool(
    "find_parent_feature",
    {
      title: "查詢上層 Feature 或 Epic",
      description: `查詢工作事項的上層 Feature 或 Epic，了解工作項目的階層關係。

🎯 **使用情境**：
• 用戶想知道某個任務屬於哪個大功能或專案時
• 需要追蹤工作進度到更高層級的規劃時
• 分析任務與產品功能的對應關係時
• 用戶詢問「這個工作是屬於哪個功能的？」
• 需要了解工作項目的上下文和背景時
• 協助專案管理或進度報告時
• 當用戶提到「上層」、「父級」、「歸屬」等概念時

🔍 **觸發關鍵字**：上層、父級、歸屬、所屬功能、大功能、Epic、Feature、專案階層`,
      inputSchema: {
        work_item_id: z.number().int().positive().describe("工作事項編號 (5位數字，範例：12345，可從對話、commit訊息或文件中提取)"),
      },
    },
    async ({ work_item_id }) => {
      try {
        const config = extractAzureDevOpsConfig();
        const service = new AzureDevOpsService(config);
        const feature = await service.findParentFeature(work_item_id);
        if (!feature) {
          return { content: [{ type: "text", text: `❌ 工作事項 ${work_item_id} 沒有找到上層的 Feature 或 Epic` }] };
        }
        const result = service.formatParentFeature(feature);
        return { content: [{ type: "text", text: result }] };
      } catch (error) {
        return { content: [{ type: "text", text: `❌ 查詢上層 Feature 失敗: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
