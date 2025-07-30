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

All Azure DevOps tools include built-in user authentication to verify the PAT and user identity before performing operations.

The Azure DevOps tools require the following parameters:
- `azure_devops_pat`: Your Azure DevOps Personal Access Token
- `azure_devops_org_url`: Your organization URL (e.g., https://dev.azure.com/yourorg)
- `azure_devops_project`: Project name (optional for some operations)

### Example Usage

```javascript
// First, validate your Azure DevOps user
await tools.validate_azure_devops_user({
  azure_devops_pat: "your-pat-token",
  azure_devops_org_url: "https://dev.azure.com/yourorg"
});

// Get work item details (includes automatic user validation)
await tools.get_work_item({
  work_item_id: 12345,
  azure_devops_pat: "your-pat-token",
  azure_devops_org_url: "https://dev.azure.com/yourorg",
  azure_devops_project: "YourProject"
});

// Find parent feature (includes automatic user validation)
await tools.find_parent_feature({
  work_item_id: 12345,
  azure_devops_pat: "your-pat-token", 
  azure_devops_org_url: "https://dev.azure.com/yourorg",
  azure_devops_project: "YourProject"
});
```

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
        "http://localhost:8787/sse"  // or remote-mcp-server-authless.your-account.workers.dev/sse
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
