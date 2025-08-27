// Redmine Quick Edit - コンテンツスクリプト
(function() {
  'use strict';

  // Redmineページかどうかを判定
  function isRedminePage() {
    return document.querySelector('.controller-issues.action-show') !== null ||
           window.location.pathname.match(/\/issues\/\d+/) !== null;
  }

  // チケットIDを取得
  function getIssueId() {
    const match = window.location.pathname.match(/\/issues\/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  // プロジェクトIDを取得
  function getProjectId() {
    const breadcrumb = document.querySelector('.breadcrumb a[href*="/projects/"]');
    if (breadcrumb) {
      const match = breadcrumb.href.match(/\/projects\/([^\/]+)/);
      return match ? match[1] : null;
    }
    return null;
  }

  // 編集可能なフィールドの設定（実際のRedmine構造に合わせて修正）
  const EDITABLE_FIELDS = {
    'Status': {
      selectors: [
        '.attribute.status .value',
        '.status .value',
        'td.status', 
        'tr.status td.value'
      ],
      labelSelectors: [
        '.attribute.status .label', 
        '.status .label',
        'td.status',
        'tr.status th',
        'tr.status td:first-child'
      ],
      type: 'select',
      apiField: 'status_id',
      optionsType: 'status'
    },
    'Priority': {
      selectors: [
        '.attribute.priority .value',
        '.priority .value', 
        'td.priority',
        'tr.priority td.value'
      ],
      labelSelectors: [
        '.attribute.priority .label',
        '.priority .label',
        'td.priority',
        'tr.priority th',
        'tr.priority td:first-child'
      ],
      type: 'select',
      apiField: 'priority_id',
      optionsType: 'priority'
    },
    'Assignee': {
      selectors: [
        'td.assigned-to',
        '.attribute.assigned-to .value',
        '.assigned-to .value',
        'tr.assigned-to td.value'
      ],
      labelSelectors: [
        'td.assigned-to',
        '.attribute.assigned-to .label',
        '.assigned-to .label', 
        'tr.assigned-to th',
        'tr.assigned-to td:first-child'
      ],
      type: 'select',
      apiField: 'assigned_to_id',
      optionsType: 'users'
    },
    'Category': {
      selectors: [
        'td.category',
        '.attribute.category .value',
        '.category .value',
        'tr.category td.value'
      ],
      labelSelectors: [
        'td.category',
        '.attribute.category .label',
        '.category .label',
        'tr.category th',
        'tr.category td:first-child'
      ],
      type: 'select',
      apiField: 'category_id',
      optionsType: 'categories'
    },
    'Target version': {
      selectors: [
        'td.fixed-version',
        '.attribute.fixed-version .value',
        '.fixed-version .value',
        'tr.fixed-version td.value'
      ],
      labelSelectors: [
        'td.fixed-version',
        '.attribute.fixed-version .label',
        '.fixed-version .label',
        'tr.fixed-version th',
        'tr.fixed-version td:first-child'
      ],
      type: 'select', 
      apiField: 'fixed_version_id',
      optionsType: 'versions'
    },
    'Start date': {
      selectors: [
        'td.start-date',
        '.attribute.start-date .value',
        '.start-date .value',
        'tr.start-date td.value'
      ],
      labelSelectors: [
        'td.start-date',
        '.attribute.start-date .label',
        '.start-date .label',
        'tr.start-date th',
        'tr.start-date td:first-child'
      ],
      type: 'date',
      apiField: 'start_date'
    },
    'Due date': {
      selectors: [
        '.attribute.due-date .value',
        '.due-date .value',
        'td.due-date',
        'tr.due-date td.value'
      ],
      labelSelectors: [
        '.attribute.due-date .label',
        '.due-date .label',
        'td.due-date',
        'tr.due-date th',
        'tr.due-date td:first-child'
      ],
      type: 'date',
      apiField: 'due_date'
    },
    'Estimated time': {
      selectors: [
        'td.estimated-hours',
        '.attribute.estimated-hours .value',
        '.estimated-hours .value',
        'tr.estimated-hours td.value'
      ],
      labelSelectors: [
        'td.estimated-hours',
        '.attribute.estimated-hours .label',
        '.estimated-hours .label',
        'tr.estimated-hours th',
        'tr.estimated-hours td:first-child'
      ],
      type: 'number',
      apiField: 'estimated_hours'
    },
    '% Done': {
      selectors: [
        '.progress.attribute .value',
        '.attribute.progress .value',
        'td.done-ratio',
        '.done-ratio .value',
        'tr.done-ratio td.value'
      ],
      labelSelectors: [
        '.progress.attribute .label',
        '.attribute.progress .label',
        'td.done-ratio',
        '.done-ratio .label',
        'tr.done-ratio th',
        'tr.done-ratio td:first-child'
      ],
      type: 'number',
      apiField: 'done_ratio',
      min: 0,
      max: 100,
      step: 1
    }
  };

  // インライン編集器クラス
  class InlineEditor {
    constructor() {
      this.currentEditor = null;
      this.originalValue = null;
      this.originalHTML = null;
      this.valueElement = null;
      this.fieldConfig = null;
      this.issueId = null;
      this.projectId = null;
    }

    // 初期化
    init() {
      if (!isRedminePage()) return;

      this.issueId = getIssueId();
      this.projectId = getProjectId();
      
      if (!this.issueId) return;

      this.setupEventListeners();
      this.addEditableIndicators();
    }

    // イベントリスナーの設定
    setupEventListeners() {
      // ダブルクリックイベント
      document.addEventListener('dblclick', (e) => {
        this.handleDoubleClick(e);
      });

      // キーボードイベント
      document.addEventListener('keydown', (e) => {
        if (this.currentEditor) {
          if (e.key === 'Escape') {
            e.preventDefault();
            this.cancelEdit();
          } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.saveEdit();
          }
        }
      });

      // クリックイベント（編集キャンセル用）
      document.addEventListener('click', (e) => {
        if (this.currentEditor && !this.currentEditor.contains(e.target)) {
          this.saveEdit();
        }
      });
    }

    // 編集可能フィールドにインジケーターを追加
    addEditableIndicators() {
      Object.entries(EDITABLE_FIELDS).forEach(([fieldName, config]) => {
        // 複数のセレクタを試す
        let labelElement = null;
        for (const selector of config.labelSelectors) {
          labelElement = document.querySelector(selector);
          if (labelElement) {
            console.log(`フィールド "${fieldName}" のラベルを発見:`, selector);
            break;
          }
        }
        
        if (labelElement) {
          labelElement.style.cursor = 'pointer';
          labelElement.title = `${fieldName}をクリックして編集`;
          labelElement.classList.add('redmine-quick-edit-label');
          
          // よりわかりやすいスタイルを追加
          labelElement.style.userSelect = 'none';
          labelElement.style.webkitUserSelect = 'none';
          
          console.log(`"${fieldName}" を編集可能に設定しました`);
        } else {
          console.log(`"${fieldName}" のラベル要素が見つかりませんでした`);
        }
      });
    }

    // ダブルクリックハンドラー
    handleDoubleClick(e) {
      console.log('ダブルクリック検出:', e.target);
      
      if (this.currentEditor) {
        console.log('既に編集中のため無視');
        return;
      }

      // どのフィールドがクリックされたかを判定
      const fieldConfig = this.getFieldConfig(e.target);
      if (!fieldConfig) {
        console.log('編集可能フィールドではありません');
        return;
      }

      console.log('編集開始:', fieldConfig.fieldName);
      e.preventDefault();
      this.startEdit(e.target, fieldConfig);
    }

    // フィールド設定を取得
    getFieldConfig(element) {
      console.log('=== フィールド設定検索開始 ===');
      console.log('対象要素:', element);
      console.log('要素のクラス:', element.className);
      console.log('要素のタグ名:', element.tagName);
      console.log('要素のテキスト:', element.textContent?.trim());
      console.log('要素の親要素クラス:', element.parentElement?.className);
      
      for (const [fieldName, config] of Object.entries(EDITABLE_FIELDS)) {
        console.log(`--- ${fieldName} の検査中 ---`);
        
        // ラベル要素の判定
        for (const selector of config.labelSelectors) {
          console.log(`ラベルセレクタ "${selector}" をテスト中...`);
          const labelElement = document.querySelector(selector);
          if (labelElement) {
            console.log(`ラベル要素発見:`, labelElement);
            console.log(`要素一致チェック: element === labelElement?`, element === labelElement);
            console.log(`包含チェック: labelElement.contains(element)?`, labelElement.contains(element));
          }
          if (labelElement && (labelElement === element || labelElement.contains(element))) {
            console.log(`✅ ラベルがマッチしました: ${fieldName} (${selector})`);
            return { ...config, fieldName };
          }
        }
        
        // 値要素の判定（値の部分をクリックした場合も対応）
        for (const selector of config.selectors) {
          console.log(`値セレクタ "${selector}" をテスト中...`);
          const valueElement = document.querySelector(selector);
          if (valueElement) {
            console.log(`値要素発見:`, valueElement);
            console.log(`要素一致チェック: element === valueElement?`, element === valueElement);
            console.log(`包含チェック: valueElement.contains(element)?`, valueElement.contains(element));
          }
          if (valueElement && (valueElement === element || valueElement.contains(element))) {
            console.log(`✅ 値がマッチしました: ${fieldName} (${selector})`);
            return { ...config, fieldName };
          }
        }
      }
      
      console.log('❌ マッチするフィールド設定が見つかりませんでした');
      console.log('=== フィールド設定検索終了 ===');
      return null;
    }

    // 編集開始
    async startEdit(clickedElement, fieldConfig) {
      // 複数のセレクタから値要素を探す
      let valueElement = null;
      for (const selector of fieldConfig.selectors) {
        valueElement = document.querySelector(selector);
        if (valueElement) {
          console.log(`値要素を発見: ${selector}`);
          break;
        }
      }
      
      if (!valueElement) {
        console.log('値要素が見つかりませんでした');
        this.showError('編集対象の要素が見つかりませんでした');
        return;
      }

      this.fieldConfig = fieldConfig;
      this.originalValue = valueElement.textContent.trim();
      this.originalHTML = valueElement.innerHTML; // HTMLも保存
      this.valueElement = valueElement; // 要素への参照も保存

      // 編集器を作成
      const editor = await this.createEditor(fieldConfig, this.originalValue);
      if (!editor) return;

      // 元の要素を非表示にして編集器を挿入
      valueElement.style.display = 'none';
      valueElement.parentNode.insertBefore(editor, valueElement.nextSibling);
      
      this.currentEditor = editor;

      // フォーカス
      const input = editor.querySelector('input, select');
      if (input) {
        input.focus();
        if (input.type === 'text' || input.type === 'number') {
          input.select();
        }
      }
    }

    // 編集器を作成
    async createEditor(fieldConfig, currentValue) {
      const container = document.createElement('div');
      container.className = 'redmine-quick-edit-container';

      let input;

      if (fieldConfig.type === 'select') {
        input = await this.createSelectInput(fieldConfig, currentValue);
      } else if (fieldConfig.type === 'date') {
        input = this.createDateInput(currentValue);
      } else if (fieldConfig.type === 'number') {
        input = this.createNumberInput(fieldConfig, currentValue);
      } else {
        input = this.createTextInput(currentValue);
      }

      if (!input) return null;

      container.appendChild(input);

      // 保存・キャンセルボタン
      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'redmine-quick-edit-buttons';

      const saveBtn = document.createElement('button');
      saveBtn.textContent = '保存';
      saveBtn.className = 'redmine-quick-edit-save';
      saveBtn.onclick = () => this.saveEdit();

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'キャンセル';
      cancelBtn.className = 'redmine-quick-edit-cancel';
      cancelBtn.onclick = () => this.cancelEdit();

      buttonContainer.appendChild(saveBtn);
      buttonContainer.appendChild(cancelBtn);
      container.appendChild(buttonContainer);

      return container;
    }

    // セレクト入力を作成
    async createSelectInput(fieldConfig, currentValue) {
      const select = document.createElement('select');
      select.className = 'redmine-quick-edit-select';
      select.size = 6; // 複数行表示で選択しやすくする

      try {
        // オプションデータを取得
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            action: 'getSelectOptions',
            type: fieldConfig.optionsType,
            projectId: this.projectId
          }, resolve);
        });

        if (!response.success) {
          throw new Error(response.error);
        }

        // 空の選択肢を追加
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-- 選択してください --';
        select.appendChild(emptyOption);

        // オプションを追加
        const items = this.extractSelectItems(response.data, fieldConfig.optionsType);
        items.forEach(item => {
          const option = document.createElement('option');
          option.value = item.id;
          option.textContent = item.name;
          
          // 現在値と一致する場合は選択状態にする
          if (item.name === currentValue || item.id.toString() === currentValue) {
            option.selected = true;
          }
          
          select.appendChild(option);
        });

        return select;
      } catch (error) {
        console.error('Failed to load select options:', error);
        this.showError('選択肢の読み込みに失敗しました');
        return null;
      }
    }

    // セレクトアイテムを抽出
    extractSelectItems(data, type) {
      console.log(`extractSelectItems for type: ${type}`, data);
      switch (type) {
        case 'status':
          return data.issue_statuses || [];
        case 'priority':
          // 優先度は複数の可能性があるプロパティ名を試す
          return data.issue_priorities || data.enumerations || data.priorities || [];
        case 'users':
          return (data.users || []).map(user => ({
            id: user.id,
            name: `${user.firstname} ${user.lastname}`
          }));
        case 'versions':
          return data.versions || [];
        case 'categories':
          return data.issue_categories || [];
        default:
          return [];
      }
    }

    // 日付入力を作成
    createDateInput(currentValue) {
      const input = document.createElement('input');
      input.type = 'date';
      input.className = 'redmine-quick-edit-date';
      
      console.log('日付入力の現在値:', currentValue);
      
      // 現在値を設定（YYYY-MM-DD形式に変換）
      if (currentValue && currentValue !== '-') {
        // 複数の日付フォーマットを試行
        let dateStr = null;
        
        // YYYY/MM/DD形式の場合
        const ymdMatch = currentValue.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
        if (ymdMatch) {
          const [, year, month, day] = ymdMatch;
          dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          console.log('YYYY/MM/DD形式を変換:', dateStr);
        }
        // MM/DD形式の場合（現在の年を仮定）
        else {
          const mdMatch = currentValue.match(/(\d{1,2})\/(\d{1,2})/);
          if (mdMatch) {
            const [, month, day] = mdMatch;
            const currentYear = new Date().getFullYear();
            dateStr = `${currentYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            console.log('MM/DD形式を変換:', dateStr);
          }
        }
        
        if (dateStr) {
          input.value = dateStr;
          console.log('設定された日付値:', dateStr);
        } else {
          console.warn('日付の解析に失敗:', currentValue);
        }
      }
      
      return input;
    }

    // 数値入力を作成
    createNumberInput(fieldConfig, currentValue) {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'redmine-quick-edit-number';
      
      if (fieldConfig.min !== undefined) input.min = fieldConfig.min;
      if (fieldConfig.max !== undefined) input.max = fieldConfig.max;
      if (fieldConfig.step !== undefined) input.step = fieldConfig.step;
      
      // 現在値を設定
      console.log('数値入力の現在値:', currentValue);
      console.log('フィールドタイプ:', fieldConfig.apiField);
      
      let numValue = null;
      
      // 予定工数の場合は時間フォーマット(HH:MM)を時間単位に変換
      if (fieldConfig.apiField === 'estimated_hours' && typeof currentValue === 'string') {
        // 時間形式（300:00など）を時間数に変換
        const timeMatch = currentValue.match(/(\d+):(\d+)/);
        if (timeMatch) {
          const hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          numValue = hours + (minutes / 60);
          console.log(`時間フォーマット ${currentValue} を ${numValue} 時間に変換`);
        }
        // 単純な数値の場合（30000 → 300.00時間のような変換）
        else {
          const rawNumber = parseInt(currentValue);
          if (!isNaN(rawNumber) && rawNumber >= 1000) {
            // 4桁以上の場合は時間:分フォーマットかもしれない
            const hours = Math.floor(rawNumber / 100);
            const minutes = rawNumber % 100;
            if (minutes < 60) {
              numValue = hours + (minutes / 60);
              console.log(`数値 ${rawNumber} を ${numValue} 時間に変換（${hours}:${minutes}と仮定）`);
            } else {
              numValue = rawNumber; // そのまま使用
            }
          } else {
            numValue = rawNumber;
          }
        }
      }
      // 進捗率の場合は%記号を取り除く
      else if (fieldConfig.apiField === 'done_ratio' && typeof currentValue === 'string') {
        const cleanValue = currentValue.replace(/[^\d.,]/g, '');
        numValue = parseFloat(cleanValue);
      }
      // その他の数値フィールド
      else {
        if (typeof currentValue === 'string') {
          const cleanValue = currentValue.replace(/[^\d.,]/g, '');
          numValue = parseFloat(cleanValue);
        } else {
          numValue = parseFloat(currentValue);
        }
      }
      
      console.log('パース後の数値:', numValue);
      if (!isNaN(numValue)) {
        input.value = numValue;
      }
      
      return input;
    }

    // テキスト入力を作成
    createTextInput(currentValue) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'redmine-quick-edit-text';
      input.value = currentValue;
      return input;
    }

    // 編集をキャンセル
    cancelEdit() {
      if (!this.currentEditor) return;

      console.log('=== 編集キャンセル開始 ===');
      console.log('元の値:', this.originalValue);
      console.log('元のHTML:', this.originalHTML);

      if (this.valueElement) {
        // 元のHTMLを完全に復元
        this.valueElement.innerHTML = this.originalHTML || '';
        this.valueElement.style.display = '';
        console.log('元のHTMLを復元しました');
      } else {
        console.error('値要素の参照が見つかりません');
      }

      // 編集UIを削除
      this.currentEditor.remove();
      this.currentEditor = null;
      this.fieldConfig = null;
      this.originalValue = null;
      this.originalHTML = null;
      this.valueElement = null;
      
      console.log('=== 編集キャンセル完了 ===');
    }

    // 編集を保存
    async saveEdit() {
      if (!this.currentEditor || !this.fieldConfig) return;

      const input = this.currentEditor.querySelector('input, select');
      const newValue = input.value;

      // 値が変更されていない場合は何もしない
      if (newValue === this.originalValue) {
        this.cancelEdit();
        return;
      }

      try {
        // 保存処理を実行
        await this.updateIssue(newValue);
        
        // UIを更新
        this.updateUI(newValue);
        
        // 編集器を削除
        this.cleanupEditor();
        
        this.showSuccess('更新しました');
      } catch (error) {
        console.error('Update failed:', error);
        this.showError(`更新に失敗しました: ${error.message}`);
      }
    }

    // チケットを更新
    async updateIssue(newValue) {
      const updateData = {};
      
      // 値を適切な型に変換
      if (this.fieldConfig.type === 'number') {
        updateData[this.fieldConfig.apiField] = newValue ? parseFloat(newValue) : null;
      } else if (this.fieldConfig.type === 'select') {
        updateData[this.fieldConfig.apiField] = newValue ? parseInt(newValue) : null;
      } else {
        updateData[this.fieldConfig.apiField] = newValue || null;
      }

      console.log('=== API更新リクエスト開始 ===');
      console.log('issueId:', this.issueId);
      console.log('updateData:', updateData);
      console.log('fieldConfig:', this.fieldConfig);

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'updateIssue',
          data: {
            issueId: this.issueId,
            updateData: updateData
          }
        }, resolve);
      });

      console.log('API更新レスポンス:', response);

      if (!response.success) {
        console.error('API更新エラー:', response.error);
        throw new Error(response.error);
      }

      console.log('API更新成功:', response.data);
      console.log('=== API更新リクエスト終了 ===');
      return response.data;
    }

    // UIを更新
    updateUI(newValue) {
      // 複数のセレクタから値要素を探す
      let valueElement = null;
      for (const selector of this.fieldConfig.selectors) {
        valueElement = document.querySelector(selector);
        if (valueElement) break;
      }
      
      if (valueElement) {
        if (this.fieldConfig.type === 'select' && newValue) {
          // セレクトの場合は表示名を取得
          const select = this.currentEditor.querySelector('select');
          const selectedOption = select.querySelector(`option[value="${newValue}"]`);
          valueElement.textContent = selectedOption ? selectedOption.textContent : newValue;
        } else {
          valueElement.textContent = newValue || '-';
        }
        valueElement.style.display = '';
      }
    }

    // 編集器をクリーンアップ
    cleanupEditor() {
      if (this.currentEditor) {
        this.currentEditor.remove();
        this.currentEditor = null;
      }
      this.fieldConfig = null;
      this.originalValue = null;
    }

    // 成功メッセージを表示
    showSuccess(message) {
      this.showNotification(message, 'success');
    }

    // エラーメッセージを表示
    showError(message) {
      this.showNotification(message, 'error');
    }

    // 通知を表示
    showNotification(message, type) {
      // 既存の通知を削除
      const existing = document.querySelector('.redmine-quick-edit-notification');
      if (existing) {
        existing.remove();
      }

      // 新しい通知を作成
      const notification = document.createElement('div');
      notification.className = `redmine-quick-edit-notification ${type}`;
      notification.textContent = message;

      // 画面上部に挿入
      const content = document.querySelector('#content') || document.body;
      content.insertBefore(notification, content.firstChild);

      // 3秒後に自動削除
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 3000);
    }
  }

  // ページ読み込み完了後に初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new InlineEditor().init();
    });
  } else {
    new InlineEditor().init();
  }
})();