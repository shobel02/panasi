# 🍞 Panasi - パン作りタイマー

**PWA対応のパン作り専用タイマーアプリ**

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live%20Demo-blue)](https://[username].github.io/panasi)
[![PWA](https://img.shields.io/badge/PWA-Ready-green)](https://web.dev/progressive-web-apps/)

パン作りをサポートする多機能音声操作タイマーアプリです。

## 機能

### 🍞 コア機能
- **複数独立タイマー管理**: 複数のパンを同時に作る際の各工程時間を独立して管理
- **音声入力操作**: Web Speech APIを使用した音声でのタイマー操作
- **データ永続化**: LocalStorageを使用したタイマー状態の自動保存・復元
- **通知機能**: タイマー完了時の音声通知・バイブレーション
- **PWA対応**: オフライン動作・ホーム画面追加対応

### 🎙️ 音声コマンド例
- **タイマー作成**: 「食パン一次発酵40分スタート」
- **タイマー停止**: 「クロワッサン止めて」
- **タイマー再開**: 「食パン再開」
- **タイマー完了**: 「食パン完了」

### 📱 レスポンシブデザイン
- スマートフォン・タブレット・デスクトップ対応
- 直感的な操作インターフェース
- アクセシビリティ配慮

## ファイル構成

```
panasi/
├── index.html          # メインHTML
├── styles.css          # スタイルシート
├── app.js             # メインJavaScript
├── manifest.json      # PWAマニフェスト
├── service-worker.js  # Service Worker
├── icons/            # PWA用アイコン
└── README.md         # このファイル
```

## 使用方法

### 基本操作
1. 「パン名」「工程名」「時間（分）」を入力してタイマー作成
2. 各タイマーの[一時停止][再開][リセット][完了]で管理
3. 音声ボタンで音声コマンドによる操作も可能

### PWAとしてインストール
1. ChromeやEdgeで本アプリを開く
2. アドレスバーの「インストール」ボタンをクリック
3. スマホの場合は「ホーム画面に追加」を選択

### 音声認識の使用
1. マイクボタンをクリック
2. 音声コマンドを話す
3. 認識結果に基づいてタイマーが操作される

## 技術仕様

### 使用技術
- **フロントエンド**: HTML5, CSS3, Vanilla JavaScript
- **PWA**: Service Worker, Web App Manifest
- **音声認識**: Web Speech API
- **データ保存**: Local Storage
- **通知**: Notification API, Vibration API

### ブラウザ対応
- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

### 必要な権限
- マイクアクセス（音声認識用）
- 通知表示（完了通知用）

## 開発情報

### セットアップ
1. ファイルをWebサーバーに配置
2. HTTPSまたはlocalhostでアクセス（PWA機能に必要）

### カスタマイズ
- `styles.css`: デザインの変更
- `app.js`: 機能の追加・修正
- `manifest.json`: PWA設定の変更

### 拡張可能な機能
- レシピデータの追加
- タイマー完了時のカスタム音声
- データのクラウド同期
- 複数言語対応

## ライセンス

MIT License - 自由に使用・改変可能

## 更新履歴

### v1.0.0 (2024-09-19)
- 初回リリース
- 複数タイマー管理機能
- 音声認識機能
- PWA対応
- 通知機能
- ローカルストレージ保存