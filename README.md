````markdown
# Remote MCP Server with Calculator, Japanese Vocabulary & Azure DevOps Tools

This remote MCP server provides multiple tools for different use cases:
- Calculator tools for mathematical operations
- Japanese vocabulary tools for language learning
- Azure DevOps tools for work item management

Deployed on Cloudflare Workers without authentication requirements.

## Available Tools

### Calculator Tools
- Basic mathematical operations
- Advanced calculations

### Japanese Vocabulary Tools
- Vocabulary lookup and management
- Language learning assistance

### Azure DevOps Tools
- **validate_azure_devops_user**: Validate Azure DevOps user identity and PAT validity
- **get_work_item**: Get detailed information about Azure DevOps work items (with user validation)
- **find_parent_feature**: Find the parent Feature or Epic of a work item (with user validation)

## Azure DevOps Tools Usage

Azure DevOps 工具透過 HTTP headers 自動讀取使用者的認證資訊，無需在每次呼叫時手動輸入 PAT。

### 客戶端設定

在 Claude Desktop 的設定檔中配置如下：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "azure-devops-tools": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://remote-mcp-server-authless.gkyjdfbqsw.workers.dev/sse",
        "--header",
        "X-Azure-DevOps-PAT:${AZURE_DEVOPS_PAT}",
        "--header",
        "X-Azure-DevOps-Org-URL:${AZURE_DEVOPS_ORG_URL}",
        "--header",
        "X-Azure-DevOps-Project:${AZURE_DEVOPS_PROJECT}"
      ],
      "env": {
        "AZURE_DEVOPS_PAT": "你的-PAT-Token",
        "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/你的組織名稱",
        "AZURE_DEVOPS_PROJECT": "你的專案名稱"
      }
    }
  }
}
```

### 可用工具

- **validate_azure_devops_user**: 驗證 Azure DevOps 使用者身份和 PAT 有效性
- **get_work_item**: 取得工作事項詳細資訊（需要 work_item_id 參數）
- **find_parent_feature**: 查詢工作事項的上層 Feature 或 Epic（需要 work_item_id 參數）

### 使用範例

```
請驗證我的 Azure DevOps 使用者身份
```

```
請幫我查詢工作事項 12345 的詳細資訊
```

```
請幫我找出工作事項 12345 的上層 Feature 或 Epic
```

### 如何取得 Personal Access Token (PAT)

1. 登入你的 Azure DevOps 組織
2. 點選右上角的使用者圖示，選擇 "Personal access tokens"
3. 點選 "New Token" 建立新的 token
4. 設定 token 名稱和過期時間
5. 在 "Scopes" 中選擇 "Work Items" 並給予 "Read" 權限
6. 點選 "Create" 並複製產生的 token
7. 將 token 填入上述設定檔的 `AZURE_DEVOPS_PAT` 欄位

### 安全注意事項

- PAT token 只儲存在你的本地設定檔中，不會傳送到服務器保存
- 建議定期更換 PAT token
- 只給予工具所需的最小權限（Work Items Read）

### Security Features

- **User Authentication**: All Azure DevOps operations include automatic user validation
- **PAT Verification**: Personal Access Tokens are validated before any API calls
- **User Identity Display**: Shows authenticated user information in results
- **Permission Validation**: Ensures PAT has appropriate permissions for operations

## Get started: 

[![Deploy to Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-authless)

This will deploy your MCP server to a URL like: `remote-mcp-server-authless.<your-account>.workers.dev/sse`

Alternatively, you can use the command line below to get the remote MCP Server created on your local machine:
```bash
npm create cloudflare@latest -- my-mcp-server --template=cloudflare/ai/demos/remote-mcp-authless
```

## Customizing your MCP Server

To add your own [tools](https://developers.cloudflare.com/agents/model-context-protocol/tools/) to the MCP server, define each tool inside the `src/tools/` directory and register them in `src/tools/index.ts`. 

## Connect to Cloudflare AI Playground

You can connect to your MCP server from the Cloudflare AI Playground, which is a remote MCP client:

1. Go to https://playground.ai.cloudflare.com/
2. Enter your deployed MCP server URL (`remote-mcp-server-authless.<your-account>.workers.dev/sse`)
3. You can now use your MCP tools directly from the playground!

## Connect Claude Desktop to your MCP server

You can also connect to your remote MCP server from local MCP clients, by using the [mcp-remote proxy](https://www.npmjs.com/package/mcp-remote). 

To connect to your MCP server from Claude Desktop, follow [Anthropic's Quickstart](https://modelcontextprotocol.io/quickstart/user) and within Claude Desktop go to Settings > Developer > Edit Config.

Update with this configuration:

```json
{
  "mcpServers": {
    "multi-tools": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://remote-mcp-server-authless.gkyjdfbqsw.workers.dev/sse"
      ]
    }
  }
}
```

Restart Claude and you should see all the tools become available.

## Security Notes

- Azure DevOps PAT tokens are passed as parameters and not stored
- This is an authless server - ensure your deployment is appropriately secured
- PAT tokens should have minimal required permissions for work item access

```` 
