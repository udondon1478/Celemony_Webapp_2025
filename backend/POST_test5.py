import asyncio
import json
import time # time.time() を使うために必要
import os # 環境変数読み込み
from dotenv import load_dotenv # 追加
from datetime import datetime
from aiohttp import web
from aiohttp_sse import sse_response # SSEレスポンスをインポート
import weakref # SSEクライアントを管理するために追加

# .envファイルから環境変数を読み込む (スクリプトと同じディレクトリか親ディレクトリを探す)
load_dotenv() # 追加

# --- LINE SDK V3 のインポート ---
import linebot.v3.messaging
# aio サブモジュールは不要。直接 messaging からインポートする
from linebot.v3.messaging import AsyncApiClient, AsyncMessagingApi # ← 正しい
from linebot.v3.messaging.models import PushMessageRequest, TextMessage

# --- 設定 ---
# 環境変数からチャンネルアクセストークンを取得 (必須)
LINE_CHANNEL_ACCESS_TOKEN = os.getenv('LINE_CHANNEL_ACCESS_TOKEN')
if not LINE_CHANNEL_ACCESS_TOKEN:
    print("エラー: 環境変数 'LINE_CHANNEL_ACCESS_TOKEN' が .env ファイル内またはシステム環境変数に設定されていません。")
    # ここで処理を停止するか、デフォルト値を設定するかを選択
    # exit(1) # 例: 停止する場合

# 連投制限の間隔（秒）
RATE_LIMIT_SECONDS = 5

# 連投制限時に送信するメッセージ
RATE_LIMIT_MESSAGE = f"メッセージありがとうございます。\n連続送信のため、{RATE_LIMIT_SECONDS}秒ほどお待ちいただいてから再度お送りください。"

# --- グローバル変数 ---
# 接続中のSSEクライアントを保持するセット
sse_clients = weakref.WeakSet()
# ユーザーごとの最終メッセージ処理時刻を保存する辞書 { "userId": timestamp (float) }
user_last_message_time = {}
# 辞書へのアクセスを保護するための非同期ロック
user_time_lock = asyncio.Lock()

# --- LINE API クライアント (非同期) ---
# インポートが修正されたので、以下の初期化はそのままのはず
configuration = linebot.v3.messaging.Configuration(
    access_token=LINE_CHANNEL_ACCESS_TOKEN
)
async_api_client = AsyncApiClient(configuration) # 正しくインポートされていればOK
async_line_bot_api = AsyncMessagingApi(async_api_client) # 正しくインポートされていればOK

# --- ヘルパー関数: Push Message 送信 (非同期) ---
# ★引数に app を追加
async def send_push_message(app, user_id, message_text):
    """指定されたユーザーIDにテキストメッセージを非同期で送信する"""
    # ★★★ app コンテキストから API クライアントを取得 ★★★
    async_line_bot_api = app['line_api']
    if not LINE_CHANNEL_ACCESS_TOKEN: # トークンがない場合は送信しない
        print("Push message skipped: LINE_CHANNEL_ACCESS_TOKEN is not set.")
        return

    print(f"Attempting to send push message to {user_id}")
    try:
        push_message_request = PushMessageRequest(
            to=user_id,
            messages=[TextMessage(text=message_text)]
        )
        # 非同期APIを使用してメッセージを送信
        await async_line_bot_api.push_message(push_message_request)
        print(f"Push message sent to {user_id}: {message_text}")
    except Exception as e:
        print(f"Error sending push message to {user_id}: {e}")
        # エラーレスポンスの詳細を確認する場合 (デバッグ用)
        if hasattr(e, 'body'):
            try:
                error_body = json.loads(e.body)
                print(f"Error body: {json.dumps(error_body, indent=2)}")
            except json.JSONDecodeError:
                print(f"Error body (non-JSON): {e.body}")

# --- ヘルパー関数: SSE メッセージ送信 (既存) ---
async def send_sse_message(text):
    """接続中の全てのSSEクライアントにメッセージを送信する"""
    # 送信するデータをJSON文字列に変換
    message_data = json.dumps({"text": text, "timestamp": datetime.now().isoformat()})
    clients_to_remove = set()
    # list(sse_clients) でイテレーション中の変更に対応
    for client in list(sse_clients):
        try:
            # clientがsse_responseのインスタンスであることを確認 (念のため)
            if hasattr(client, 'send') and callable(client.send):
                 await client.send(message_data)
            else:
                print(f"Invalid SSE client object found: {client}")
                clients_to_remove.add(client)

        except ConnectionResetError:
            print(f"Client connection reset. Removing client: {client}")
            clients_to_remove.add(client)
        except Exception as e:
            # 接続が既に切れている場合などに発生しうる
            print(f"Error sending message to SSE client {client}: {e}")
            clients_to_remove.add(client)

    # エラーが発生したクライアントを削除
    for client in clients_to_remove:
        sse_clients.discard(client) # discardは要素が存在しなくてもエラーにならない


# --- Webhook ハンドラ (/test) 修正 ---
async def handle_post(request):
    # ★★★ request.app からアプリケーションインスタンスを取得 ★★★
    app = request.app
    # line_api = app['line_api'] # 必要ならここで取得
    print("[handle_post] Received request.")
    try:
        post_data = await request.read()
        print(f"[handle_post] Read request body: {len(post_data)} bytes.")
        payload = json.loads(post_data.decode('utf-8'))
        print("[handle_post] Parsed JSON payload.")

        tasks = [] # Push API呼び出しを格納するリスト

        for event in payload.get('events', []):
            print(f"[handle_post] Processing event: type={event.get('type')}")

            # メッセージイベント、テキストメッセージ、かつユーザーからのメッセージか確認
            if not (event.get('type') == 'message' and
                    isinstance(event.get('message'), dict) and # messageオブジェクトが存在するか
                    event['message'].get('type') == 'text' and
                    isinstance(event.get('source'), dict) and # sourceオブジェクトが存在するか
                    event['source'].get('type') == 'user' and
                    event['source'].get('userId')):
                print("[handle_post] Skipping event: Not a text message from a user.")
                continue # 対象外のイベントはスキップ

            user_id = event['source']['userId']
            message_text = event['message']['text']
            current_time = time.time() # Unixタイムスタンプ（float）

            should_send_to_sse = False
            # --- 連投チェック (非同期ロックを使用) ---
            async with user_time_lock:
                last_time = user_last_message_time.get(user_id)

                if last_time is None:
                    # 初回メッセージ
                    should_send_to_sse = True
                    user_last_message_time[user_id] = current_time
                    print(f"User {user_id}: First message. Processing.")
                else:
                    # 2回目以降
                    time_diff = current_time - last_time
                    if time_diff >= RATE_LIMIT_SECONDS:
                        # インターバル経過後
                        should_send_to_sse = True
                        user_last_message_time[user_id] = current_time
                        print(f"User {user_id}: Interval ({time_diff:.2f}s) >= {RATE_LIMIT_SECONDS}s. Processing.")
                    else:
                        # インターバル内 (連投)
                        should_send_to_sse = False
                        print(f"User {user_id}: Interval ({time_diff:.2f}s) < {RATE_LIMIT_SECONDS}s. Rate limiting.")
                        # ★★★ send_push_message に app を渡す ★★★
                        task = asyncio.create_task(send_push_message(app, user_id, RATE_LIMIT_MESSAGE))
                        tasks.append(task)

            # --- SSE送信処理 ---
            if should_send_to_sse:
                print(f"[handle_post] Sending message from {user_id} to SSE clients: '{message_text}'")
                # SSEクライアントにメッセージを送信 (これも非同期)
                # await をつけないと即座に次のループに進んでしまうため、完了を待つ
                await send_sse_message(message_text)
                print(f"Sent text via SSE: {message_text}")
            else:
                print(f"[handle_post] Skipping SSE send for rate-limited user {user_id}.")

        # バックグラウンドで実行したPush APIタスクの結果を待つ (任意、エラーログ等に)
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True) # 例外が発生しても止めずに結果を収集

    except json.JSONDecodeError:
        print("Invalid JSON payload received")
        return web.Response(status=400, text='{"status": "Invalid JSON"}', content_type='application/json')
    except Exception as e:
        print(f"Error processing POST request: {e}")
        import traceback
        traceback.print_exc() # スタックトレースを出力してデバッグしやすくする
        return web.Response(status=500, text='{"status": "Internal Server Error"}', content_type='application/json')

    # レスポンス送信
    return web.json_response({"status": "OK"})

# --- SSE ハンドラ (/sse) - 変更なし ---
async def sse_handler(request):
    """SSE接続を処理するハンドラ"""
    print("[sse_handler] SSE client connected.")
    response = None # finallyブロックで参照するため外で宣言
    try:
        async with sse_response(request) as resp:
            response = resp # finallyブロックで使えるように代入
            sse_clients.add(resp)
            print(f"[sse_handler] Client added. Current clients: {len(sse_clients)}")
            # クライアントが接続している間、待機 (aiohttp-sseが管理)
            await asyncio.Event().wait() # 接続が切れるまで待機

    except asyncio.CancelledError:
        print("[sse_handler] SSE handler cancelled (client disconnected).")
    except Exception as e:
        print(f"[sse_handler] Error in SSE handler: {e}")
    finally:
        # sse_responseコンテキストマネージャが終了時にクリーンアップするが、
        # WeakSetからも明示的に削除 (参照が残っている場合の保険)
        if response in sse_clients:
             sse_clients.discard(response)
        print(f"[sse_handler] SSE client disconnected. Current clients: {len(sse_clients)}")
        # WeakSetは参照がなくなれば自動削除されるので、必須ではない場合も多い

# --- アプリケーション起動 (main) - 変更なし ---
async def main(host='0.0.0.0', port=8081):
    # aiohttpアプリケーションを作成
    app = web.Application()

    # --- ★★★ LINE API クライアントの初期化と設定 (main 関数内) ★★★ ---
    configuration = linebot.v3.messaging.Configuration(
        access_token=LINE_CHANNEL_ACCESS_TOKEN
    )
    # AsyncApiClient は内部でセッションを持つため、アプリ全体で共有するのが効率的
    async_api_client = AsyncApiClient(configuration)
    async_line_bot_api = AsyncMessagingApi(async_api_client)

    # アプリケーションコンテキストに格納してハンドラからアクセスできるようにする
    app['line_api'] = async_line_bot_api
    app['line_config'] = configuration # 設定も格納しておくと便利

    # --- ★★★ クライアントのクリーンアップ設定 ★★★ ---
    # アプリケーション終了時に API クライアント (が持つコネクション) を閉じる
    async def close_line_client(app_instance):
        print("Closing LINE API client connections...")
        # AsyncMessagingApi インスタンスから AsyncApiClient を取得し、その close メソッドを呼ぶ
        await app_instance['line_api'].api_client.close()
        print("LINE API client connections closed.")

    # アプリケーションのクリーンアップ処理リストに追加
    app.cleanup_ctx.append(close_line_client)

    # ルートを追加
    app.router.add_post('/test', handle_post) # POSTリクエスト用 (Webhook受け取り)
    app.router.add_get('/sse', sse_handler)   # SSE接続用 (Webアプリへのデータ送信)

    # Webサーバーを作成して実行
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)

    print(f'Starting async server on http://{host}:{port}...')
    print(f"Webhook endpoint: http://<your-server-address>:{port}/test")
    print(f"SSE endpoint: http://<your-server-address>:{port}/sse")
    if not LINE_CHANNEL_ACCESS_TOKEN:
        print("WARN: LINE_CHANNEL_ACCESS_TOKEN is not set. Push messages will not be sent.")

    await site.start()

    # 中断されるまでサーバーを実行し続ける
    try:
        await asyncio.Event().wait()
    except (KeyboardInterrupt, asyncio.CancelledError):
        print("\nServer shutting down...")
    finally:
        await runner.cleanup()
        print("Server stopped.")


# --- エントリーポイント - 変更なし ---
if __name__ == '__main__':
    # 必要なライブラリのインストール確認 (例)
    try:
        import linebot.v3.messaging
        import aiohttp_sse
        import dotenv # dotenvも確認
    except ImportError as e:
        print(f"必要なライブラリがインストールされていません: {e}")
        print("pip install line-bot-sdk aiohttp aiohttp-sse")
        exit(1)

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Application terminated by user.")