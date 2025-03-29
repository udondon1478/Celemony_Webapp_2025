import asyncio
import asyncio
import json
from datetime import datetime
# collections.defaultdict と socket は不要になったので削除
from aiohttp import web, ClientSession # ClientSession をインポート

# DataAggregator クラス全体を削除
# AsyncUDPSender クラス全体を削除

# チャットビューアアプリのURL
CHAT_VIEWER_URL = "http://localhost:5001/api/message" # ポート番号を 27099 から 5001 に戻す

async def send_to_chat_viewer(session, text):
    """指定されたテキストをチャットビューアアプリにPOST送信する"""
    payload = {'text': text}
    try:
        async with session.post(CHAT_VIEWER_URL, json=payload) as response:
            if response.status == 200:
                print(f"Successfully sent '{text}' to chat viewer.")
            else:
                print(f"Failed to send '{text}' to chat viewer. Status: {response.status}, Response: {await response.text()}")
    except Exception as e:
        print(f"Error sending message to chat viewer: {e}")


async def handle_post(request):
    print("[handle_post] Received request.") # ログ追加
    # aggregator = request.app['aggregator'] # aggregator は不要になったので削除
    try:
        post_data = await request.read()
        print(f"[handle_post] Read request body: {len(post_data)} bytes.") # ログ追加
        payload = json.loads(post_data.decode('utf-8'))
        print("[handle_post] Parsed JSON payload.") # ログ追加

        # イベントから必要な情報を抽出
        async with ClientSession() as session: # リクエストごとにセッションを作成
            for event in payload.get('events', []):
                print(f"[handle_post] Processing event: type={event.get('type')}") # ログ追加
                if event.get('type') == 'message' and event['message'].get('type') == 'text':
                    text = event['message']['text']
                    # timestamp はチャットビューア側で付与するためここでは不要
                    # timestamp = event.get('timestamp', int(datetime.now().timestamp() * 1000))

                    # チャットビューアアプリにテキストを送信 (非同期呼び出し)
                    await send_to_chat_viewer(session, text)

                    print(f"Sent text to chat viewer: {text}")

    except json.JSONDecodeError:
        print("Invalid JSON payload received")
        return web.Response(status=400, text='{"status": "Invalid JSON"}', content_type='application/json')
    except Exception as e:
        print(f"Error processing POST request: {e}")
        return web.Response(status=500, text='{"status": "Internal Server Error"}', content_type='application/json')

    # レスポンス送信
    return web.json_response({"status": "OK"})

async def main(host='0.0.0.0', port=8081):
    # aggregator と udp_sender の初期化を削除

    # aiohttpアプリケーションを作成
    app = web.Application()
    # app['aggregator'] = aggregator # aggregator は不要になったので削除

    # POSTルートを追加
    app.router.add_post('/test', handle_post) # Nginxプロキシ用に/testパスでリッスン

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
