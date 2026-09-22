import type { AppState } from './types';
import { showToast } from './share';

export interface CollabState {
  planId: string | null;
  version: number | null;
  updatedAt: string | null;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
}

export interface PlanDataResponse {
  id: string;
  title: string;
  data: AppState;
  version: number;
  createdAt: string;
  updatedAt: string;
}

class CollabManager {
  private state: CollabState = {
    planId: null,
    version: null,
    updatedAt: null,
    isSaving: false,
    hasUnsavedChanges: false,
  };

  private listeners: Array<(state: CollabState) => void> = [];

  public getState(): CollabState {
    return { ...this.state };
  }

  public subscribe(listener: (state: CollabState) => void): () => void {
    this.listeners.push(listener);
    listener(this.getState());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    const currentState = this.getState();
    this.listeners.forEach((listener) => listener(currentState));
  }

  public initFromPlan(plan: PlanDataResponse): void {
    this.state.planId = plan.id;
    this.state.version = plan.version;
    this.state.updatedAt = plan.updatedAt;
    this.state.hasUnsavedChanges = false;
    this.notify();
  }

  public reset(): void {
    this.state.planId = null;
    this.state.version = null;
    this.state.updatedAt = null;
    this.state.isSaving = false;
    this.state.hasUnsavedChanges = false;
    this.notify();
  }

  public markUnsaved(): void {
    if (this.state.planId && !this.state.hasUnsavedChanges) {
      this.state.hasUnsavedChanges = true;
      this.notify();
    }
  }

  /**
   * 共有リンクを新規発行してクリップボードにコピー
   */
  public async createShareLink(
    title: string,
    appState: AppState,
    triggerBtn?: HTMLElement | null
  ): Promise<string | null> {
    // 既に共有中の場合は現在のURLをコピー
    if (this.state.planId) {
      const shareUrl = `${window.location.origin}/p/${this.state.planId}`;
      await this.copyToClipboard(shareUrl);
      showToast('共有リンクをコピーしました！');
      return shareUrl;
    }

    if (this.state.isSaving) return null;
    this.state.isSaving = true;
    this.notify();

    if (triggerBtn) {
      triggerBtn.classList.add('animate-pulse');
    }

    try {
      const response = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || '無題の旅程',
          data: appState,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create plan: ${response.status}`);
      }

      const res = await response.json();
      this.state.planId = res.id;
      this.state.version = res.version;
      this.state.hasUnsavedChanges = false;
      appState.shareId = res.id;
      this.notify();

      const shareUrl = `${window.location.origin}${res.url}`;
      window.history.pushState(null, '', res.url);

      await this.copyToClipboard(shareUrl);
      showToast('共有リンクを発行してコピーしました！');

      return shareUrl;
    } catch (error) {
      console.error('Failed to create share link:', error);
      showToast('共有リンクの発行に失敗しました');
      return null;
    } finally {
      this.state.isSaving = false;
      this.notify();
      if (triggerBtn) {
        triggerBtn.classList.remove('animate-pulse');
      }
    }
  }

  /**
   * 変更をクラウドに保存（楽観的ロック）
   */
  public async savePlan(
    title: string,
    appState: AppState,
    options?: {
      onConflict?: (latest: { version: number; updatedAt?: string }) => void;
      onSuccess?: () => void;
    }
  ): Promise<boolean> {
    if (!this.state.planId || this.state.version === null) {
      // まだ共有リンクが発行されていない場合は新規発行にフォールバック
      const url = await this.createShareLink(title, appState);
      return !!url;
    }

    if (this.state.isSaving) return false;
    this.state.isSaving = true;
    this.notify();

    try {
      const response = await fetch(`/api/plans/${this.state.planId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || '無題の旅程',
          data: appState,
          version: this.state.version,
        }),
      });

      if (response.status === 409) {
        // 楽観的ロック競合（他ユーザーによる更新）
        const errData = await response.json();
        if (options?.onConflict) {
          options.onConflict({
            version: errData.latestVersion,
            updatedAt: errData.latestUpdatedAt,
          });
        } else {
          showToast('⚠️ 他の人が更新しました。最新版を読み直してください');
        }
        return false;
      }

      if (!response.ok) {
        throw new Error(`Failed to save: ${response.status}`);
      }

      const res = await response.json();
      this.state.version = res.newVersion;
      this.state.hasUnsavedChanges = false;
      this.notify();

      showToast('変更を保存しました！');
      if (options?.onSuccess) {
        options.onSuccess();
      }
      return true;
    } catch (error) {
      console.error('Failed to save plan:', error);
      showToast('保存に失敗しました');
      return false;
    } finally {
      this.state.isSaving = false;
      this.notify();
    }
  }

  /**
   * 最新のプランデータをサーバーから取得
   */
  public async fetchLatest(): Promise<PlanDataResponse | null> {
    if (!this.state.planId) return null;

    try {
      const response = await fetch(`/api/plans/${this.state.planId}`);
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch plan (${response.status}): ${errText}`);
      }
      const plan: PlanDataResponse = await response.json();
      if (typeof plan.data === 'string') {
        try {
          plan.data = JSON.parse(plan.data);
        } catch (e) {
          console.error('Failed to parse plan.data JSON:', e);
        }
      }
      this.state.version = plan.version;
      this.state.updatedAt = plan.updatedAt;
      this.state.hasUnsavedChanges = false;
      this.notify();
      return plan;
    } catch (error) {
      console.error('Failed to fetch latest plan:', error);
      showToast('最新データの取得に失敗しました');
      return null;
    }
  }

  private async copyToClipboard(text: string): Promise<void> {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    } catch (e) {
      console.warn('Clipboard copy failed:', e);
    }
  }
}

export const collabManager = new CollabManager();
