# GitHub Pages用設定

## セットアップ手順

1. **リポジトリ作成**: GitHubで新しいパブリックリポジトリ `panasi` を作成
2. **ファイルアップロード**: 全ファイルをリポジトリにアップロード
3. **Pages有効化**: Settings → Pages → Source: Deploy from a branch → main
4. **カスタムドメイン** (オプション): Settings → Pages → Custom domain

## 必要ファイル一覧

### 必須ファイル
- `index.html` - メインアプリケーション
- `app.js` - JavaScript機能
- `styles.css` - スタイルシート
- `manifest.json` - PWAマニフェスト
- `service-worker.js` - Service Worker

### 推奨ファイル
- `README.md` - プロジェクト説明
- `.gitignore` - Git無視ファイル設定
- `CNAME` - カスタムドメイン用（必要に応じて）

## デプロイ後の確認

1. **基本動作**: https://[username].github.io/panasi でアクセス
2. **PWA機能**: ブラウザの「ホーム画面に追加」が表示されるか
3. **音声認識**: マイクボタンが正しく動作するか
4. **オフライン**: ネットワークを切断しても動作するか

## トラブルシューティング

### HTTPS必須機能
- 音声認識 (Web Speech API)
- PWAインストール
- Service Worker

### 解決方法
GitHub Pagesは自動的にHTTPS提供するため、これらの機能が正常に動作します。