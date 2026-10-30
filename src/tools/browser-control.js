/**
 * browser_control：标签页管理（关闭/读取/更新/查询/激活）。
 *
 * 参数：action = close_tab | get_tab | update_tab | query_tabs | activate_tab
 *       params = { tabId, updateInfo, queryInfo }
 * 返回结构与各 action 一致，统一含 { success, action, ... }。
 */
import { BaseTool } from './base.js';
import { assertSessionTab, closeSessionGroup, getSessionGroupId } from '../tabs.js';

export class BrowserControlTool extends BaseTool {
  name = 'browser_control';

  async execute({ action, params }, context) {
    if (!action || !params) return this.createErrorResult('action and params are required');
    try {
      switch (action) {
        case 'close_tab':
          return await this.closeTab(params, context);
        case 'get_tab':
          return await this.getTab(params, context);
        case 'update_tab':
          return await this.updateTab(params, context);
        case 'query_tabs':
          return await this.queryTabs(params, context);
        case 'activate_tab':
          return await this.activateTab(params, context);
        case 'close_group':
          return await this.closeGroup(context);
        default:
          return this.createErrorResult(`Unknown action: ${action}`);
      }
    } catch (err) {
      return this.createErrorResult(err instanceof Error ? err.message : 'Operation failed');
    }
  }

  /** 只回传 AI 关心的字段，避免把 chrome.tabs.Tab 的其它内部字段塞进 MCP 结果 */
  static summarize(tab) {
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      status: tab.status,
      active: tab.active,
      groupId: tab.groupId,
    };
  }

  async closeTab(params, context) {
    if (!params.tabId) return this.createErrorResult('tabId is required');
    await assertSessionTab(params.tabId, context);
    await chrome.tabs.remove(params.tabId);
    return this.createTextResult(
      JSON.stringify({ success: true, action: 'close_tab', tabId: params.tabId }),
    );
  }

  async getTab(params, context) {
    if (!params.tabId) return this.createErrorResult('tabId is required');
    const tab = await assertSessionTab(params.tabId, context);
    return this.createTextResult(
      JSON.stringify({ success: true, action: 'get_tab', tab: BrowserControlTool.summarize(tab) }),
    );
  }

  async updateTab(params, context) {
    if (!params.tabId) return this.createErrorResult('tabId is required');
    await assertSessionTab(params.tabId, context);
    const tab = await chrome.tabs.update(params.tabId, params.updateInfo || {});
    if (!tab) return this.createErrorResult(`Tab ${params.tabId} does not exist`);
    return this.createTextResult(
      JSON.stringify({ success: true, action: 'update_tab', tab: BrowserControlTool.summarize(tab) }),
    );
  }

  async activateTab(params, context) {
    if (!params.tabId) return this.createErrorResult('tabId is required');
    const tab = await assertSessionTab(params.tabId, context);
    // 窗口最小化时用户看不到激活效果，先还原窗口
    if (tab.windowId !== undefined) {
      const win = await chrome.windows.get(tab.windowId).catch(() => undefined);
      if (win?.state === 'minimized') {
        await chrome.windows.update(tab.windowId, { state: 'normal' }).catch(() => {});
      }
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    }
    const activated = await chrome.tabs.update(params.tabId, { active: true });
    if (!activated) return this.createErrorResult(`Tab ${params.tabId} does not exist`);
    return this.createTextResult(
      JSON.stringify({
        success: true,
        action: 'activate_tab',
        tab: BrowserControlTool.summarize(activated),
      }),
    );
  }

  async closeGroup(context) {
    if (!context?.taskId) return this.createErrorResult('close_group requires a task context');
    const result = await closeSessionGroup(context);
    return this.createTextResult(
      JSON.stringify({ success: true, action: 'close_group', ...result }),
    );
  }

  async queryTabs(params, context) {
    const groupId = await getSessionGroupId(context);
    if (context?.taskId && groupId === undefined) {
      return this.createTextResult(
        JSON.stringify({ success: true, action: 'query_tabs', tabs: [] }),
      );
    }
    const queryInfo = { ...(params.queryInfo || {}) };
    if (groupId !== undefined) queryInfo.groupId = groupId;
    const tabs = (await chrome.tabs.query(queryInfo)).filter(
      (tab) => groupId === undefined || tab.groupId === groupId,
    );
    return this.createTextResult(
      JSON.stringify({
        success: true,
        action: 'query_tabs',
        tabs: tabs.map((tab) => BrowserControlTool.summarize(tab)),
      }),
    );
  }
}
