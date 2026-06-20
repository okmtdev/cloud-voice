<div align="center">

# 🔊 Cloud Voice

### **クラウドに送るだけ。あのスピーカーが、しゃべりだす。**

*Send it to the cloud — hear it from the speaker that matters.*

ブラウザからアップロードした音声やマイクの声を、
インターネット越しに、あなたの Mac / Linux の **好きなスピーカー** から鳴らす。
常時待機のデスクトップ常駐アプリと、GCP 上のリレーサーバーを、
WebSocket の双方向リアルタイム通信でつなぎます。

</div>

---

## ✨ Cloud Voice とは

会議室の据え置きスピーカー、店舗の館内放送、自宅のオーディオ —— 
「あの場所のスピーカー」から音を出したいのに、いちいちその場の PC を操作していませんか？

**Cloud Voice** は、出力したいスピーカーを持つマシンに常駐エージェントを置いておくだけ。
あとはどこからでもブラウザを開き、wav / mp3 をドラッグするか、マイクに話しかけるだけで、
**遠隔のスピーカーが、その場でしゃべりだします。**

> 🎙️ **話す場所と、聞こえる場所を、切り離す。**

### こんな場面で

- 📢 **遠隔アナウンス** — 別フロア・別拠点のスピーカーへ、ブラウザから即・放送。
- 🤖 **クラウドの音声を現実世界へ** — Web サービスで生成した音声合成や通知音を、物理スピーカーで鳴らす。
- 🎵 **共有スピーカーへのリモート再生** — 会議室・店舗・イベント会場の音響を、手元の端末から操作。
- 🗣️ **リアルタイム拡声** — マイクに話した声を、ほぼリアルタイムで遠隔スピーカーへ。

---

## 🏗️ アーキテクチャ

```
 ┌──────────────┐    WebSocket     ┌─────────────────┐    WebSocket    ┌──────────────────┐
 │   ブラウザ    │ ───────────────▶ │  リレーサーバー   │ ──────────────▶ │  常駐エージェント  │
 │ (Web UI)     │  音声 + 制御メッセージ │  (GCP Cloud Run) │ 音声 + 制御メッセージ │ (Mac / Linux)    │
 │ アップロード / マイク │ ◀─────────────── │   ※中継のみ      │ ◀────────────── │  スピーカーから再生 │
 └──────────────┘     状態通知       └─────────────────┘     状態通知      └──────────────────┘
```

- **リレーサーバー (`server/`)** — GCP Cloud Run にデプロイする WebSocket リレー + Web UI。
  音声データの中身には一切触れず、ペアリングコード（room）で結ばれたピア同士をつなぐだけ。
- **常駐エージェント (`agent/`)** — スピーカーを持つマシンで常時待機。受け取った音声を
  `ffmpeg` でデコードし、**選択した出力デバイス**へ再生。切断されても自動で再接続します。
- **ブラウザ UI** — サーバーが配信する単一ページ。wav / mp3 のアップロードと、
  マイク入力のリアルタイムストリーミングに対応。

通信仕様の詳細は [`protocol.md`](./protocol.md) を参照してください。

---

## 🚀 クイックスタート

### 必要なもの

- Node.js 20 以上（テスト実行には 22 以上）
- エージェントを動かすマシンに **`ffmpeg`**（再生エンジンとして使用）
  - macOS: `brew install ffmpeg`
  - Linux (Debian/Ubuntu): `sudo apt install ffmpeg`
- **スピーカーを複数から選ぶ場合の追加ツール**
  - macOS: `brew install switchaudio-osx`（出力デバイスの列挙・切り替えに使用。
    未導入でも「システム既定の出力」へは再生できます。選択時は **OS の既定出力先が切り替わります**）
  - Linux: 音声バックエンドを自動判定します。
    - **PulseAudio / PipeWire** が動いていれば sink を直接指定して再生（追加ツール不要）
    - 動いていなければ **ALSA** にフォールバック。デバイス列挙には `alsa-utils`
      （`aplay`）が必要です（`sudo apt install alsa-utils`）。ヘッドレスの
      Raspberry Pi などはこちらになります

### 1. インストール

```bash
git clone https://github.com/okmtdev/cloud-voice.git
cd cloud-voice
npm install        # workspaces (server / agent) を一括インストール
npm run build      # TypeScript をビルド
```

### 2. リレーサーバーを起動（ローカル）

> `start:server` / `dev:server` などのショートカットは **リポジトリのルート**
> （`cloud-voice/`）で実行してください。`server/` の中には `start` / `dev` しか
> ありません。`npm run start:*` は事前に `npm run build` が必要です。

```bash
# リポジトリのルートで実行
npm run start:server
# → http://localhost:8080 で Web UI が開きます

# 開発中はホットリロード版が便利です（ビルド不要）
npm run dev:server
```

任意で共有シークレットを設定できます:

```bash
CLOUD_VOICE_TOKEN=my-secret npm run start:server
```

### 3. 常駐エージェントを起動

スピーカーを鳴らしたいマシンで:

```bash
cd agent
cp .env.example .env      # CLOUD_VOICE_SERVER / ROOM / TOKEN を編集
npm run start

# 出力デバイス一覧の確認だけしたいとき:
node dist/index.js --list-devices
```

`.env` を使わずコマンドラインで渡すことも可能です:

```bash
node dist/index.js --server=ws://localhost:8080 --room=kitchen-1234
```

### 4. ブラウザから鳴らす

1. リレーサーバーの URL（ローカルなら http://localhost:8080）を開く
2. エージェントと同じ **ペアリングコード**（room）を入力して「接続」
3. スピーカー（出力デバイス）を選ぶ
4. **wav / mp3 をアップロード**するか、**マイクの「録音開始」**を押す → 遠隔スピーカーが鳴ります 🎉

---

## 🛠️ ローカル開発

ホットリロード付きで、サーバーとエージェントを同時に動かしながら開発できます。

### 前提

- Node.js 22 以上推奨（`.nvmrc` あり。`nvm use` で固定。アプリ稼働は 20 以上、テスト実行は 22 以上）
- エージェント側のマシンに `ffmpeg`（音声を実際に鳴らす場合）

### セットアップ

```bash
npm install                       # ルートで一度だけ。workspaces を一括インストール

# 環境変数ファイルを用意（任意・ローカルでは未設定でも動きます）
cp server/.env.example server/.env
cp agent/.env.example  agent/.env   # CLOUD_VOICE_SERVER=ws://localhost:8080 などに編集
```

`server/.env` / `agent/.env` は git 管理外（`.gitignore` 済み）です。
実際の環境変数が常に `.env` より優先されます。

### 起動（ターミナルを 2 つ使用）

```bash
# ターミナル A — リレーサーバー（tsx watch で自動再起動）
npm run dev:server
# → http://localhost:8080

# ターミナル B — 常駐エージェント（ソース変更で自動再起動）
npm run dev:agent
# agent/.env に CLOUD_VOICE_SERVER / CLOUD_VOICE_ROOM を設定しておくこと
```

ビルド成果物を使って動かす場合は、`npm run build` のあと
`npm run start:server` / `npm run start:agent` を使います。

### よく使うコマンド

| コマンド                | 内容                                               |
| ----------------------- | -------------------------------------------------- |
| `npm run dev:server`    | サーバーをホットリロードで起動。                   |
| `npm run dev:agent`     | エージェントをホットリロードで起動。               |
| `npm run build`         | 全 workspace を TypeScript ビルド。                |
| `npm run typecheck`     | 型チェックのみ（`lint` も同じ）。                  |
| `npm test`              | 単体テストを実行（Node 標準テストランナー）。      |
| `npm run start:server`  | ビルド済みサーバーを起動。                         |
| `npm run start:agent`   | ビルド済みエージェントを起動。                     |

### テスト

追加の依存ゼロで、Node 標準のテストランナー（`node:test`）を使っています。
TypeScript はビルド不要で、型ストリッピングを使うため **Node 22 以上** が必要です。

```bash
npm test
```

対象は外部依存のない中核ロジックです。

- `server/test/rooms.test.ts` — 部屋（ペアリング）と中継ロジック
- `server/test/env.test.ts` — `.env` ローダ
- `agent/test/config.test.ts` — 設定 / フラグのパース

### CI

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) が、push と PR で
**型チェック → ビルド → テスト** を実行します。結果（成功 / 失敗）は GitHub の
チェックとして **PR 上に自動で表示** されます。

### 開発のヒント

- `ffmpeg` が無い環境でも、リレー・WebSocket・Web UI の挙動はそのまま確認できます
  （音声再生のみエージェント側で `ffmpeg が見つかりません` の status になります）。
- エージェントの出力デバイス id を調べるには
  `cd agent && node dist/index.js --list-devices`（または `npm run build` 後に実行）。
- ブラウザのマイク入力は `localhost` または HTTPS でのみ許可されます。

---

## ☁️ デプロイ

サーバー（クラウド側のインフラ）とエージェント（各マシンのアプリ）を別々にデプロイします。

### A. インフラ準備（初回のみ）

WebSocket をそのまま扱える **GCP Cloud Run** を使います。

```bash
# 1. プロジェクトを選択
gcloud config set project YOUR_PROJECT_ID

# 2. 必要な API を有効化
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com

# 3. コンテナイメージ用の Artifact Registry リポジトリを作成
gcloud artifacts repositories create cloud-voice \
  --repository-format=docker --location=asia-northeast1
```

### B. アプリケーションのデプロイ — リレーサーバー

付属の Cloud Build 設定で、ビルド → push → Cloud Run デプロイまで一括実行できます。

```bash
gcloud builds submit --config server/cloudbuild.yaml \
  --substitutions=_REGION=asia-northeast1,_SERVICE=cloud-voice
```

本番で共有シークレットを使う場合は、サービスに環境変数を設定します。

```bash
gcloud run services update cloud-voice \
  --region=asia-northeast1 \
  --set-env-vars=CLOUD_VOICE_TOKEN=your-strong-secret
```

デプロイ後に払い出される `https://cloud-voice-xxxx.a.run.app` を、
エージェントの `CLOUD_VOICE_SERVER` に **`wss://` で**（`https` ではなく）設定します。

<details>
<summary>Cloud Build を使わず手動でビルド・デプロイする場合</summary>

```bash
REGION=asia-northeast1
IMAGE=$REGION-docker.pkg.dev/YOUR_PROJECT_ID/cloud-voice/cloud-voice:latest

docker build -t "$IMAGE" server
docker push "$IMAGE"
gcloud run deploy cloud-voice \
  --image="$IMAGE" --region="$REGION" --platform=managed \
  --allow-unauthenticated --port=8080 --timeout=3600
```

</details>

> **メモ**
> - WebSocket の長時間接続のため Cloud Run の `--timeout=3600` を指定しています。
> - イメージタグは既定で `latest` です（手動の `gcloud builds submit` では
>   `$COMMIT_SHA` が空になるため）。不変タグにしたい場合は
>   `--substitutions=...,_TAG=$(git rev-parse --short HEAD)` を渡してください。
> - 認証付きにする場合は `CLOUD_VOICE_TOKEN` をサービスに設定し、
>   エージェント / ブラウザ双方で同じトークンを使ってください。

### C. アプリケーションのデプロイ — 常駐エージェント

スピーカーを鳴らしたい各マシンに配置し、**常時起動**させます。

```bash
git clone https://github.com/okmtdev/cloud-voice.git
cd cloud-voice && npm install && npm run build
cd agent && cp .env.example .env   # CLOUD_VOICE_SERVER=wss://... ROOM / TOKEN を設定
node dist/index.js --list-devices  # 出力デバイス id を確認
```

#### Linux（systemd で常駐化）

> ⚠️ **Node のパスに注意。** systemd はログインシェルの PATH を使わないため、
> `nvm` で入れた Node は見えません。`ExecStart` には **Node 20 以上の絶対パス**を
> 指定してください（`which node` で確認）。apt 標準の `/usr/bin/node` が古いと
> `SyntaxError: Unexpected token {`（ESM 非対応）で起動に失敗します。デーモン運用
> では NodeSource などでシステム全体に新しい Node を入れるのが堅実です:
> `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs`

`/etc/systemd/system/cloud-voice-agent.service`:

```ini
[Unit]
Description=Cloud Voice Agent
After=network-online.target sound.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/cloud-voice/agent
# `which node` の結果（Node 20+ の絶対パス）を指定する。
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
User=YOUR_USER
EnvironmentFile=/opt/cloud-voice/agent/.env

[Install]
WantedBy=default.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cloud-voice-agent
journalctl -u cloud-voice-agent -f   # ログ確認
```

#### macOS（launchd で常駐化）

`~/Library/LaunchAgents/com.cloudvoice.agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>com.cloudvoice.agent</string>
    <key>ProgramArguments</key>
    <array>
      <string>/usr/local/bin/node</string>
      <string>/Users/YOU/cloud-voice/agent/dist/index.js</string>
    </array>
    <key>WorkingDirectory</key><string>/Users/YOU/cloud-voice/agent</string>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardErrorPath</key><string>/tmp/cloud-voice-agent.log</string>
    <key>StandardOutPath</key><string>/tmp/cloud-voice-agent.log</string>
  </dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.cloudvoice.agent.plist
launchctl start com.cloudvoice.agent
```

> launchd は `.env` を自動読込しないため、`agent/.env` を配置するか、
> plist の `EnvironmentVariables` に `CLOUD_VOICE_SERVER` などを記載してください。

---

## 🧩 リポジトリ構成

```
cloud-voice/
├── server/                 # リレーサーバー + Web UI（Cloud Run 用）
│   ├── src/                #   express + ws のリレー実装
│   ├── public/             #   ブラウザ UI（アップロード / マイク）
│   ├── Dockerfile
│   └── cloudbuild.yaml
├── agent/                  # 常駐エージェント（Mac / Linux）
│   └── src/                #   ws クライアント / デバイス列挙 / ffmpeg 再生
├── protocol.md             # WebSocket プロトコル仕様
└── README.md
```

---

## ⚙️ 設定一覧

### サーバー (環境変数)

| 変数                 | 既定値  | 説明                                            |
| -------------------- | ------- | ----------------------------------------------- |
| `PORT`               | `8080`  | 待ち受けポート（Cloud Run が自動注入）。         |
| `CLOUD_VOICE_TOKEN`  | （なし）| 設定すると全接続にこのトークンを要求します。     |

### エージェント (環境変数 / `--flag`)

| 変数 / フラグ                          | 説明                                                |
| -------------------------------------- | --------------------------------------------------- |
| `CLOUD_VOICE_SERVER` / `--server`      | リレーサーバーの URL（`ws://` または `wss://`）。    |
| `CLOUD_VOICE_ROOM` / `--room`          | ブラウザと合わせるペアリングコード。                |
| `CLOUD_VOICE_TOKEN` / `--token`        | サーバーがトークンを要求する場合に指定。            |
| `CLOUD_VOICE_DEVICE` / `--device`      | 起動時に使う出力デバイス id（任意）。               |
| `--list-devices`                       | 出力デバイス一覧を表示して終了。                    |

---

## 🔒 セキュリティ

- リレーは音声を保存せず、ペアリングされたピアへ中継するだけです。
- 公開デプロイ時は `CLOUD_VOICE_TOKEN` の設定と、推測されにくいペアリングコードの利用を強く推奨します。
- ブラウザのマイク利用には HTTPS（または `localhost`）が必要です。

---

## 📋 動作確認の注意

ネットワーク中継・制御プロトコル部分は単体で動作しますが、実際の **音声出力は
`ffmpeg` と各 OS のオーディオサブシステム**（macOS: AudioToolbox / Linux: PulseAudio・PipeWire）
に依存します。デバイス列挙や出力先指定の挙動は環境差があるため、初回は
`--list-devices` で id を確認し、ブラウザのデバイス選択と合わせてご利用ください。

---

## 📄 ライセンス

[MIT](./LICENSE) © 2026 Yuki Nakajima
