import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
      // 使用 Profile API 來驗證 PAT 和取得使用者資訊
      const profileUrl = "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.0";

      const response = await fetch(profileUrl, {
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

      const profile = await response.json() as any;
      
      const userProfile: UserProfile = {
        id: profile.id,
        displayName: profile.displayName,
        emailAddress: profile.emailAddress,
        descriptor: profile.descriptor
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
      const errorMsg = "Azure DevOps 配置不完整，請檢查環境變數 AZURE_DEVOPS_PAT, AZURE_DEVOPS_ORG_URL";
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
    
    // 移除 HTML 標籤
    const cleanText = description.replace(/<[^>]*>/g, '');
    
    // 限制長度
    if (cleanText.length > 500) {
      return cleanText.substring(0, 500) + "...";
    }
    
    return cleanText;
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
        
        console.error(`📋 API 錯誤詳情: ${errorText}`);
        
        if (response.status === 404) {
          throw new Error(`工作事項 ${workItemId} 不存在`);
        } else if (response.status === 401) {
          // 檢查是否是 PAT 過期
          if (errorText.includes("expired") || errorText.includes("Personal Access Token used has expired")) {
            throw new Error("Azure DevOps Personal Access Token (PAT) 已過期，請更新您的 PAT");
          }
          throw new Error("Azure DevOps 驗證失敗，請檢查 PAT 權限或是否已過期");
        }
        throw new Error(`Azure DevOps API 錯誤: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const workItem = await response.json() as WorkItem;
      return workItem;
    } catch (error) {
      console.error("❌ 取得工作事項失敗:", error instanceof Error ? error.message : String(error));
      throw new Error(`取得工作事項失敗: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 遞迴查詢工作事項的上層 Feature 或 Epic
   */
  async findParentFeature(
    workItemId: number,
    visited = new Set<number>(),
    depth = 0
  ): Promise<WorkItem | null> {
    // 多重安全檢查
    if (visited.has(workItemId)) {
      return null;
    }
    
    if (depth > MAX_RECURSION_DEPTH) {
      return null;
    }
    
    if (visited.size > MAX_VISITED_ITEMS) {
      return null;
    }
    
    if (!this.isValidWorkItemId(workItemId)) {
      console.log(`⚠️ 無效的工作事項 ID: ${workItemId}`);
      return null;
    }
    
    visited.add(workItemId);

    try {
      // API 調用前的延遲（避免過快調用）
      if (depth > 0) {
        await new Promise(resolve => setTimeout(resolve, API_DELAY_MS));
      }
      
      // 取得包含關聯資訊的工作事項
      const url = this.buildApiUrl(workItemId, true);

      const response = await fetch(url, {
        method: "GET",
        headers: this.getAuthHeaders(),
      });

      this.logApiCall('GET', url, workItemId, response.status);

      if (!response.ok) {
        const errorText = await response.text();
        
        if (response.status === 404) {
          console.log(`❌ 工作事項 ${workItemId} 不存在或無權限訪問`);
          return null;
        } else if (response.status === 401) {
          if (errorText.includes("expired") || errorText.includes("Personal Access Token used has expired")) {
            throw new Error("Azure DevOps Personal Access Token (PAT) 已過期，請更新您的 PAT");
          }
          throw new Error("Azure DevOps 驗證失敗，請檢查 PAT 權限或是否已過期");
        } else if (response.status === 429) {
          console.log(`⚠️ API 速率限制，跳過工作事項 ${workItemId}`);
          return null;
        }
        throw new Error(`Azure DevOps API 錯誤: ${response.status} ${response.statusText}`);
      }

      const workItem = await response.json() as WorkItem;
      
      console.log(`📋 工作事項 ${workItem.id}: ${workItem.fields["System.Title"]} (${workItem.fields["System.WorkItemType"]})`);

      // 如果這個工作事項本身就是 Feature 或 Epic，返回結果
      if (workItem.fields["System.WorkItemType"] === "Feature" || workItem.fields["System.WorkItemType"] === "Epic") {
        console.log(`🎯 找到 ${workItem.fields["System.WorkItemType"]}: ${workItem.fields["System.Title"]}`);
        return workItem;
      }

      // 查詢父項關聯
      if (workItem.relations && workItem.relations.length > 0) {
        let parentCount = 0;
        
        for (const relation of workItem.relations) {
          if (relation.rel === "System.LinkTypes.Hierarchy-Reverse") {
            parentCount++;
            
            // 限制每個工作事項最多處理指定數量的父項關聯
            if (parentCount > MAX_PARENT_RELATIONS) {
              console.log(`⚠️ 父項關聯過多，跳過後續查詢`);
              break;
            }
            
            const parentIdMatch = relation.url.match(/workItems\/(\d+)$/);
            
            if (parentIdMatch) {
              const parentId = parseInt(parentIdMatch[1]);
              
              // 檢查父項 ID 是否有效
              if (!this.isValidWorkItemId(parentId)) {
                console.log(`⚠️ 無效的父項 ID: ${parentId}`);
                continue;
              }
              
              console.log(`⬆️ 找到父項工作事項: ${parentId}`);
              
              // 遞迴查詢父項
              const parentFeature = await this.findParentFeature(parentId, visited, depth + 1);
              if (parentFeature) {
                return parentFeature;
              }
            }
          }
        }
      }

      console.log(`📝 工作事項 ${workItemId} 沒有上層的 Feature 或 Epic`);
      return null;

    } catch (error) {
      console.error(`❌ 查詢工作事項 ${workItemId} 失敗:`, error instanceof Error ? error.message : String(error));
      
      // 對於特定錯誤，重新拋出；對於其他錯誤，返回 null 讓程序繼續
      if (error instanceof Error && 
          (error.message.includes("PAT") || error.message.includes("驗證失敗"))) {
        throw error;
      }
      
      return null;
    }
  }

  /**
   * 格式化工作事項資訊
   */
  formatWorkItem(workItem: WorkItem): string {
    const fields = workItem.fields;
    let result = `**🎯 工作事項 #${fields["System.Id"]}**\n\n`;
    
    result += `**📝 標題**: ${fields["System.Title"]}\n`;
    result += `**🏷️ 類型**: ${fields["System.WorkItemType"]}\n`;
    result += `**📊 狀態**: ${fields["System.State"]}\n`;
    
    if (fields["System.AssignedTo"]) {
      result += `**👤 指派給**: ${fields["System.AssignedTo"].displayName}\n`;
    } else {
      result += `**👤 指派給**: 未指派\n`;
    }
    
    result += `**👨‍💻 建立者**: ${fields["System.CreatedBy"].displayName}\n`;
    result += `**📅 建立日期**: ${this.formatDate(fields["System.CreatedDate"])}\n`;
    result += `**🔄 最後修改**: ${this.formatDate(fields["System.ChangedDate"])}\n`;
    
    if (fields["Microsoft.VSTS.Common.Priority"]) {
      result += `**⚡ 優先度**: ${fields["Microsoft.VSTS.Common.Priority"]}\n`;
    }
    
    if (fields["Microsoft.VSTS.Common.Severity"]) {
      result += `**🚨 嚴重性**: ${fields["Microsoft.VSTS.Common.Severity"]}\n`;
    }
    
    if (fields["System.Tags"]) {
      result += `**🏷️ 標籤**: ${fields["System.Tags"]}\n`;
    }
    
    result += `\n**📄 描述**:\n`;
    result += this.formatDescription(fields["System.Description"]);
    result += `\n\n**🔗 連結**: [在 Azure DevOps 中檢視](${workItem.url})\n`;

    return result;
  }

  /**
   * 格式化上層 Feature/Epic
   */
  formatParentFeature(feature: WorkItem): string {
    const fields = feature.fields;
    let result = `**🎯 找到上層 ${fields["System.WorkItemType"]}**\n\n`;
    
    result += `**📝 ID**: ${fields["System.Id"]}\n`;
    result += `**📝 標題**: ${fields["System.Title"]}\n`;
    result += `**🏷️ 類型**: ${fields["System.WorkItemType"]}\n`;
    result += `**📊 狀態**: ${fields["System.State"]}\n`;
    
    if (fields["System.AssignedTo"]) {
      result += `**👤 指派給**: ${fields["System.AssignedTo"].displayName}\n`;
    } else {
      result += `**👤 指派給**: 未指派\n`;
    }
    
    result += `**👨‍💻 建立者**: ${fields["System.CreatedBy"].displayName}\n`;
    result += `**📅 建立日期**: ${this.formatDate(fields["System.CreatedDate"])}\n`;
    result += `**🔄 最後修改**: ${this.formatDate(fields["System.ChangedDate"])}\n`;
    
    if (fields["Microsoft.VSTS.Common.Priority"]) {
      result += `**⚡ 優先度**: ${fields["Microsoft.VSTS.Common.Priority"]}\n`;
    }
    
    if (fields["System.Tags"]) {
      result += `**🏷️ 標籤**: ${fields["System.Tags"]}\n`;
    }
    
    result += `\n**📄 描述**:\n`;
    result += this.formatDescription(fields["System.Description"]);
    result += `\n\n**🔗 連結**: [在 Azure DevOps 中檢視](${feature.url})\n`;

    return result;
  }
}

// Zod 驗證架構
const ValidateUserSchema = z.object({
  azure_devops_pat: z.string().min(1),
  azure_devops_org_url: z.string().url(),
});

const GetWorkItemSchema = z.object({
  work_item_id: z.number().int().positive(),
  azure_devops_pat: z.string().min(1),
  azure_devops_org_url: z.string().url(),
  azure_devops_project: z.string().optional(),
});

const FindParentFeatureSchema = z.object({
  work_item_id: z.number().int().positive(),
  azure_devops_pat: z.string().min(1),
  azure_devops_org_url: z.string().url(),
  azure_devops_project: z.string().optional(),
});

/**
 * 註冊 Azure DevOps 工具到 MCP 伺服器
 */
export function registerAzureDevOpsTools(server: McpServer) {
  // 註冊使用者驗證工具
  server.tool("validate_azure_devops_user", {
    description: "驗證 Azure DevOps 使用者身份和 PAT 有效性，顯示使用者資訊",
    inputSchema: {
      type: "object",
      properties: {
        azure_devops_pat: {
          type: "string",
          description: "Azure DevOps Personal Access Token",
        },
        azure_devops_org_url: {
          type: "string",
          description: "Azure DevOps 組織 URL (例如: https://dev.azure.com/yourorg)",
        },
      },
      required: ["azure_devops_pat", "azure_devops_org_url"],
    },
  }, async (args) => {
    try {
      const { azure_devops_pat, azure_devops_org_url } = ValidateUserSchema.parse(args);

      const config: AzureDevOpsConfig = {
        pat: azure_devops_pat,
        orgUrl: azure_devops_org_url,
      };

      const service = new AzureDevOpsService(config);
      const userProfile = await service.validateUser();

      const result = `**🎯 Azure DevOps 使用者驗證成功**\n\n` +
        `**👤 使用者名稱**: ${userProfile.displayName}\n` +
        `**📧 電子郵件**: ${userProfile.emailAddress}\n` +
        `**🆔 使用者 ID**: ${userProfile.id}\n` +
        `**🔐 驗證狀態**: ✅ PAT 有效且具備存取權限\n` +
        `**🏢 組織**: ${azure_devops_org_url}\n\n` +
        `**💡 說明**: 您現在可以使用其他 Azure DevOps 工具來查詢工作事項資訊。`;

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ 使用者驗證失敗: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  // 註冊取得工作事項工具
  server.tool("get_work_item", {
    description: "根據工作事項編號取得 Azure DevOps 工作事項的詳細資訊，包括標題、狀態、指派人員、描述等。用於查詢特定工作事項的完整資訊。",
    inputSchema: {
      type: "object",
      properties: {
        work_item_id: {
          type: "number",
          description: "要查詢的工作事項編號 (Work Item ID)",
        },
        azure_devops_pat: {
          type: "string",
          description: "Azure DevOps Personal Access Token",
        },
        azure_devops_org_url: {
          type: "string",
          description: "Azure DevOps 組織 URL (例如: https://dev.azure.com/yourorg)",
        },
        azure_devops_project: {
          type: "string",
          description: "Azure DevOps 專案名稱 (可選)",
        },
      },
      required: ["work_item_id", "azure_devops_pat", "azure_devops_org_url"],
    },
  }, async (args) => {
    try {
      const { work_item_id, azure_devops_pat, azure_devops_org_url, azure_devops_project } = 
        GetWorkItemSchema.parse(args);

      const config: AzureDevOpsConfig = {
        pat: azure_devops_pat,
        orgUrl: azure_devops_org_url,
        project: azure_devops_project,
      };

      const service = new AzureDevOpsService(config);
      
      // 首先驗證使用者身份
      console.log("🔐 開始驗證使用者身份...");
      const userProfile = await service.validateUser();
      console.log(`✅ 使用者驗證成功，歡迎 ${userProfile.displayName}`);
      
      // 驗證成功後執行工作事項查詢
      const workItem = await service.getWorkItem(work_item_id);
      let result = `**👤 驗證使用者**: ${userProfile.displayName} (${userProfile.emailAddress})\n\n`;
      result += service.formatWorkItem(workItem);

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `錯誤: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  // 註冊查詢上層 Feature/Epic 工具
  server.tool("find_parent_feature", {
    description: "查詢工作事項的上層 Feature 或 Epic。適用於 Task、Bug、User Story、Product Backlog Item 等子工作事項，可以找到它們所屬的 Feature 或 Epic。",
    inputSchema: {
      type: "object",
      properties: {
        work_item_id: {
          type: "number",
          description: "要查詢的工作事項編號 (Work Item ID)",
        },
        azure_devops_pat: {
          type: "string",
          description: "Azure DevOps Personal Access Token",
        },
        azure_devops_org_url: {
          type: "string",
          description: "Azure DevOps 組織 URL (例如: https://dev.azure.com/yourorg)",
        },
        azure_devops_project: {
          type: "string",
          description: "Azure DevOps 專案名稱 (可選)",
        },
      },
      required: ["work_item_id", "azure_devops_pat", "azure_devops_org_url"],
    },
  }, async (args) => {
    try {
      const { work_item_id, azure_devops_pat, azure_devops_org_url, azure_devops_project } = 
        FindParentFeatureSchema.parse(args);

      const config: AzureDevOpsConfig = {
        pat: azure_devops_pat,
        orgUrl: azure_devops_org_url,
        project: azure_devops_project,
      };

      const service = new AzureDevOpsService(config);

      // 首先驗證使用者身份
      console.log("🔐 開始驗證使用者身份...");
      const userProfile = await service.validateUser();
      console.log(`✅ 使用者驗證成功，歡迎 ${userProfile.displayName}`);

      // 驗證輸入
      if (!Number.isInteger(work_item_id) || work_item_id <= 0 || work_item_id > 999999) {
        return {
          content: [
            {
              type: "text",
              text: `❌ 無效的工作事項 ID: ${work_item_id}`,
            },
          ],
          isError: true,
        };
      }

      console.log(`🔍 查詢工作事項 ${work_item_id} 的上層 Feature/Epic`);

      // 設置查詢超時
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error(`查詢超時 (${QUERY_TIMEOUT_MS / 1000}秒)`)), QUERY_TIMEOUT_MS);
      });

      const feature = await Promise.race([
        service.findParentFeature(work_item_id),
        timeoutPromise
      ]);

      if (!feature) {
        return {
          content: [
            {
              type: "text",
              text: `❌ 工作事項 ${work_item_id} 沒有找到上層的 Feature 或 Epic\n\n💡 **可能原因**:\n- 此工作事項本身就是最高層級\n- 沒有設置階層關係\n- 工作事項不存在或無權限訪問`,
            },
          ],
        };
      }

      let result = `**👤 驗證使用者**: ${userProfile.displayName} (${userProfile.emailAddress})\n\n`;
      result += service.formatParentFeature(feature);

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };

    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `錯誤: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });
}
