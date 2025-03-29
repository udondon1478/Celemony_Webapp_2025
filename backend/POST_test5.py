import asyncio
import asyncio
import json
from datetime import datetime
from aiohttp import web
from aiohttp_sse import sse_response # SSEレスポンスをインポート
import weakref # SSEクライアントを管理するために追加

# 接続中のSSEクライアントを保持するセット (weakrefを使用してメモリリークを防ぐ)
sse_clients = weakref.WeakSet()

async def send_sse_message(text):
    """接続中の全てのSSEクライアントにメッセージを送信する"""
    # 送信するデータをJSON文字列に変換
    message_data = json.dumps({"text": text, "timestamp": datetime.now().isoformat()})
    # 接続が切れているクライアントを考慮しつつ送信
    disconnected_clients = set()
    for client in sse_clients:
        try:
            await client.send(message_data)
        except ConnectionResetError:
            print("Client connection reset. Removing client.")
            disconnected_clients.add(client)
        except Exception as e:
            print(f"Error sending message to SSE client: {e}")
            disconnected_clients.add(client)

async def handle_post(request):
    print("[handle_post] Received request.")
    try:
        post_data = await request.read()
        print(f"[handle_post] Read request body: {len(post_data)} bytes.")
        payload = json.loads(post_data.decode('utf-8'))
        print("[handle_post] Parsed JSON payload.")

        # イベントから必要な情報を抽出してSSEクライアントに送信
        for event in payload.get('events', []):
            print(f"[handle_post] Processing event: type={event.get('type')}")
            if event.get('type') == 'message' and event['message'].get('type') == 'text':
                text = event['message']['text']
                # 接続中のSSEクライアントにメッセージを送信
                await send_sse_message(text)
                print(f"Sent text via SSE: {text}")

    except json.JSONDecodeError:
        print("Invalid JSON payload received")
        return web.Response(status=400, text='{"status": "Invalid JSON"}', content_type='application/json')
    except Exception as e:
        print(f"Error processing POST request: {e}")
        return web.Response(status=500, text='{"status": "Internal Server Error"}', content_type='application/json')

    # レスポンス送信
    return web.json_response({"status": "OK"})

async def sse_handler(request):
    """SSE接続を処理するハンドラ"""
    print("[sse_handler] SSE client connected.")
    try:
        # sse_responseコンテキストマネージャを使用してSSE接続を確立
        async with sse_response(request) as resp:
            # クライアントを管理リストに追加
            sse_clients.add(resp)
            print(f"[sse_handler] Client added. Current clients: {len(sse_clients)}")
            # クライアントが接続している間、待機
            # asyncio.Event().wait() はここでは適切でないため、接続維持のためのループを入れる
            # または、単に接続が開いている間は何もしない (aiohttp-sseが管理)
            while True:
                 # 定期的にpingを送るなどして接続を維持することも可能
                 # await resp.ping()
                 await asyncio.sleep(60) # 例: 60秒ごとにチェック
                 if resp.connection is None or resp.connection.closed:
                     print("[sse_handler] Client connection closed detected in loop.")
                     break

    except asyncio.CancelledError:
        print("[sse_handler] SSE handler cancelled.")
        # キャンセルされた場合もクリーンアップが必要な場合がある
    except Exception as e:
        print(f"[sse_handler] Error in SSE handler: {e}")
    finally:
        # sse_responseコンテキストマネージャが終了時に自動でクリーンアップするはずだが、
        # 明示的に削除することも可能 (ただし、WeakSetなので参照がなくなれば自動削除される)
        # sse_clients.discard(resp) # respがスコープ外に出る前に削除する場合
        print(f"[sse_handler] SSE client disconnected. Current clients: {len(sse_clients)}")
        # WeakSetは自動的に参照がなくなったオブジェクトを削除するため、明示的な削除は不要な場合が多い
        # ただし、接続終了時に確実にリストから除外したい場合は discard を使う

async def main(host='0.0.0.0', port=8081):
    # aiohttpアプリケーションを作成
    app = web.Application()

    # ルートを追加
    app.router.add_post('/test', handle_post) # POSTリクエスト用
    app.router.add_get('/sse', sse_handler)   # SSE接続用

    # Webサーバーを作成して実行
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)

    # UDP送信タスクの開始を削除

    print(f'Starting async server on http://{host}:{port}...')
    await site.start()

    # 中断されるまでサーバーを実行し続ける
    try:
        # メインタスクを生かし続ける
        await asyncio.Event().wait()
    except (KeyboardInterrupt, asyncio.CancelledError):
        print("Server shutting down...")
    finally:
        # クリーンアップ
        # udp_task のキャンセル処理を削除
        await runner.cleanup()
        print("Server stopped.")


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Application terminated by user.")
