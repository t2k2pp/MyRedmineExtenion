// ポップアップ画面のJavaScript
document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('settingsForm');
  const redmineUrlInput = document.getElementById('redmineUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const statusDiv = document.getElementById('status');
  const helpLink = document.getElementById('helpLink');

  // ポップアップの安定性を向上
  document.addEventListener('focusout', function(e) {
    // ポップアップ内の要素間のフォーカス移動時は閉じない
    setTimeout(() => {
      if (!document.hasFocus()) {
        // フォーカスが完全にポップアップ外に移った場合のみ何もしない
        // ブラウザのデフォルト動作に任せる
      }
    }, 100);
  });

  // 既存の設定を読み込み
  loadSettings();

  // 自動保存機能（入力時にデバウンス処理で保存）
  let saveTimeout;
  function autoSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const redmineUrl = redmineUrlInput.value.trim();
      const apiKey = apiKeyInput.value.trim();
      
      if (redmineUrl || apiKey) {
        chrome.storage.sync.set({
          redmineUrl: redmineUrl ? normalizeUrl(redmineUrl) : '',
          apiKey: apiKey
        });
      }
    }, 1000); // 1秒後に自動保存
  }

  // 入力フィールドに自動保存を追加
  redmineUrlInput.addEventListener('input', autoSave);
  apiKeyInput.addEventListener('input', autoSave);

  // コピー&ペーストを確実に動作させる
  [redmineUrlInput, apiKeyInput].forEach(input => {
    // 右クリックメニューを有効化
    input.addEventListener('contextmenu', function(e) {
      e.stopPropagation();
    });

    // キーボードショートカットを有効化
    input.addEventListener('keydown', function(e) {
      // Ctrl+V, Ctrl+C, Ctrl+X, Ctrl+A を通す
      if (e.ctrlKey && ['v', 'c', 'x', 'a'].includes(e.key.toLowerCase())) {
        e.stopPropagation();
        return;
      }
    });

    // フォーカス時に選択状態をクリア（ペーストしやすくする）
    input.addEventListener('focus', function(e) {
      // わずかな遅延後に全選択（コピー&ペーストしやすくする）
      setTimeout(() => {
        if (this.value) {
          this.select();
        }
      }, 100);
    });
  });

  // フォーム送信ハンドラー
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    saveSettings();
  });

  // 接続テストボタンハンドラー
  testBtn.addEventListener('click', function() {
    testConnection();
  });

  // ヘルプリンクハンドラー
  helpLink.addEventListener('click', function(e) {
    e.preventDefault();
    const helpSection = document.querySelector('.help-section');
    helpSection.open = !helpSection.open;
  });

  // 設定を読み込み
  function loadSettings() {
    chrome.storage.sync.get(['redmineUrl', 'apiKey'], function(result) {
      if (result.redmineUrl) {
        redmineUrlInput.value = result.redmineUrl;
      }
      if (result.apiKey) {
        apiKeyInput.value = result.apiKey;
      }
    });
  }

  // 設定を保存
  function saveSettings() {
    const redmineUrl = redmineUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();

    if (!redmineUrl && !apiKey) {
      showStatus('URLまたはAPIキーを入力してください', 'error');
      return;
    }

    // URLの正規化
    const normalizedUrl = redmineUrl ? normalizeUrl(redmineUrl) : '';

    chrome.storage.sync.set({
      redmineUrl: normalizedUrl,
      apiKey: apiKey
    }, function() {
      if (chrome.runtime.lastError) {
        showStatus('設定の保存に失敗しました', 'error');
      } else {
        showStatus('設定を保存しました', 'success');
      }
    });
  }

  // 接続テスト
  async function testConnection() {
    const redmineUrl = redmineUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();

    if (!redmineUrl || !apiKey) {
      showStatus('URLとAPIキーを入力してください', 'error');
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = 'テスト中...';
    showStatus('接続をテストしています...', 'info');

    try {
      const normalizedUrl = normalizeUrl(redmineUrl);
      
      // 一時的に設定を保存
      await new Promise((resolve) => {
        chrome.storage.sync.set({
          redmineUrl: normalizedUrl,
          apiKey: apiKey
        }, resolve);
      });

      // バックグラウンドスクリプトを通じてAPIテスト
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'getSelectOptions',
          type: 'status'
        }, resolve);
      });

      if (response.success) {
        showStatus('接続に成功しました！', 'success');
      } else {
        showStatus(`接続に失敗しました: ${response.error}`, 'error');
      }
    } catch (error) {
      showStatus(`接続エラー: ${error.message}`, 'error');
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = '接続テスト';
    }
  }

  // ステータス表示
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    
    // 成功メッセージは3秒後に消す
    if (type === 'success') {
      setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.className = 'status';
      }, 3000);
    }
  }

  // URL正規化
  function normalizeUrl(url) {
    // プロトコルがない場合はhttpsを追加
    if (!url.match(/^https?:\/\//)) {
      url = 'https://' + url;
    }
    
    // 末尾のスラッシュを削除
    return url.replace(/\/$/, '');
  }
});