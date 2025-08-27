// Redmine APIクライアント
class RedmineAPI {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // 末尾のスラッシュを削除
    this.apiKey = apiKey;
  }

  async request(endpoint, method = 'GET', data = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'X-Redmine-API-Key': this.apiKey,
      'Content-Type': 'application/json'
    };

    const config = {
      method: method,
      headers: headers
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      config.body = JSON.stringify(data);
    }

    try {
      console.log('=== API Request Debug ===');
      console.log('URL:', url);
      console.log('Method:', method);
      console.log('Headers:', headers);
      console.log('Body:', data ? JSON.stringify(data) : 'なし');

      const response = await fetch(url, config);
      
      console.log('Response Status:', response.status);
      console.log('Response Headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        // 具体的なエラーメッセージを追加
        if (response.status === 401) {
          errorMessage += ' - APIキーが無効または期限切れです';
        } else if (response.status === 403) {
          errorMessage += ' - このチケットを編集する権限がありません';
        } else if (response.status === 404) {
          errorMessage += ' - チケットまたはリソースが見つかりません';
        } else if (response.status === 422) {
          errorMessage += ' - 送信データが無効です';
        }
        
        console.error('API Error:', errorMessage);
        throw new Error(errorMessage);
      }

      // レスポンスが空かチェック
      const responseText = await response.text();
      console.log('Response Text:', responseText);
      console.log('Response Text Length:', responseText.length);
      
      if (!responseText.trim()) {
        // 空のレスポンスの場合は成功として扱う（RedmineのPUTリクエストは空を返すことがある）
        console.log('空のレスポンスを成功として処理');
        return { success: true };
      }
      
      // JSONパースを試行
      try {
        const parsedData = JSON.parse(responseText);
        console.log('JSON Parse Success:', parsedData);
        return parsedData;
      } catch (jsonError) {
        console.warn('JSON parse failed:', jsonError.message);
        console.warn('Raw response text:', responseText);
        return { success: true, message: responseText };
      }
    } catch (error) {
      console.error('Redmine API Error:', error);
      throw error;
    }
  }

  // チケット情報を取得
  async getIssue(issueId) {
    return await this.request(`/issues/${issueId}.json?include=relations,attachments,changesets,journals,watchers`);
  }

  // チケットを更新
  async updateIssue(issueId, data) {
    return await this.request(`/issues/${issueId}.json`, 'PUT', { issue: data });
  }

  // プロジェクトの情報を取得
  async getProject(projectId) {
    return await this.request(`/projects/${projectId}.json?include=trackers,issue_categories,enabled_modules`);
  }

  // ステータス一覧を取得
  async getIssueStatuses() {
    return await this.request('/issue_statuses.json');
  }

  // 優先度一覧を取得
  async getIssuePriorities() {
    return await this.request('/enumerations/issue_priorities.json');
  }

  // ユーザー一覧を取得
  async getUsers() {
    return await this.request('/users.json');
  }

  // バージョン一覧を取得
  async getVersions(projectId) {
    return await this.request(`/projects/${projectId}/versions.json`);
  }

  // カテゴリ一覧を取得
  async getCategories(projectId) {
    return await this.request(`/projects/${projectId}/issue_categories.json`);
  }
}

// メッセージハンドラー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateIssue') {
    handleUpdateIssue(request.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 非同期レスポンスを示す
  }

  if (request.action === 'getIssueData') {
    getIssueData(request.issueId)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'getSelectOptions') {
    getSelectOptions(request.type, request.projectId)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// チケット更新処理
async function handleUpdateIssue(data) {
  const settings = await getStorageData(['redmineUrl', 'apiKey']);
  
  if (!settings.redmineUrl || !settings.apiKey) {
    throw new Error('Redmine URLまたはAPIキーが設定されていません');
  }

  const api = new RedmineAPI(settings.redmineUrl, settings.apiKey);
  return await api.updateIssue(data.issueId, data.updateData);
}

// チケットデータ取得
async function getIssueData(issueId) {
  const settings = await getStorageData(['redmineUrl', 'apiKey']);
  
  if (!settings.redmineUrl || !settings.apiKey) {
    throw new Error('Redmine URLまたはAPIキーが設定されていません');
  }

  const api = new RedmineAPI(settings.redmineUrl, settings.apiKey);
  return await api.getIssue(issueId);
}

// 選択肢データ取得（ステータス、優先度等）
async function getSelectOptions(type, projectId = null) {
  const settings = await getStorageData(['redmineUrl', 'apiKey']);
  
  if (!settings.redmineUrl || !settings.apiKey) {
    throw new Error('Redmine URLまたはAPIキーが設定されていません');
  }

  const api = new RedmineAPI(settings.redmineUrl, settings.apiKey);

  switch (type) {
    case 'status':
      return await api.getIssueStatuses();
    case 'priority':
      return await api.getIssuePriorities();
    case 'users':
      return await api.getUsers();
    case 'versions':
      if (projectId) {
        return await api.getVersions(projectId);
      }
      return { versions: [] };
    case 'categories':
      if (projectId) {
        return await api.getCategories(projectId);
      }
      return { issue_categories: [] };
    default:
      throw new Error(`Unknown option type: ${type}`);
  }
}

// ストレージからデータ取得
function getStorageData(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, resolve);
  });
}