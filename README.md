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

- Node.js 20 以上
- エージェントを動かすマシンに **`ffmpeg`**（再生エンジンとして使用）
  - macOS: `brew install ffmpeg`
  - Linux (Debian/Ubuntu): `sudo apt install ffmpeg`（出力先選択には PulseAudio / PipeWire を推奨）

### 1. インストール

```bash
git clone https://github.com/okmtdev/cloud-voice.git
cd cloud-voice
npm install        # workspaces (server / agent) を一括インストール
npm run build      # TypeScript をビルド
```

### 2. リレーサーバーを起動（ローカル）

```bash
npm run start:server
# → http://localhost:8080 で Web UI が開きます
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

## ☁️ GCP (Cloud Run) へのデプロイ

WebSocket をそのまま扱える Cloud Run が手軽でおすすめです。

```bash
# Artifact Registry リポジトリを用意（初回のみ）
gcloud artifacts repositories create cloud-voice \
  --repository-format=docker --location=asia-northeast1

# ビルド & デプロイ
gcloud builds submit --config server/cloudbuild.yaml \
  --substitutions=_REGION=asia-northeast1,_SERVICE=cloud-voice
```

デプロイ後に払い出される `https://cloud-voice-xxxx.a.run.app` を、
エージェントの `CLOUD_VOICE_SERVER` に **`wss://` で** 設定してください。

> **メモ**
> - WebSocket の長時間接続のため `--timeout=3600` を指定しています。
> - 認証付きにしたい場合は Cloud Run に `CLOUD_VOICE_TOKEN` 環境変数を設定し、
>   エージェント / ブラウザ双方で同じトークンを使ってください。
> - 簡易な手動コンテナビルドは `server/Dockerfile` を直接利用できます。

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
