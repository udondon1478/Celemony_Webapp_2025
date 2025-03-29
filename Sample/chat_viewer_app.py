import asyncio
import json
from datetime import datetime
from aiohttp import web
import aiohttp_jinja2
import jinja2

# メッセージを保存するリスト (メモリ上)
messages = []
# SSE接続を保持するリスト
sse_connections = []

async def handle_index(request):
    """ルートパス '/' でHTMLページを表示"""
    context = {'messages': messages} # 現在のメッセージをテンプレートに渡す
    response = aiohttp_jinja2.render_template('index.html', request, context)
    return response

async def handle_post_message(request):
    """'/api/message' でPOSTリクエストを受け取り、メッセージを保存・配信"""
    try:
        data = await request.json()
        text = data.get('text')
        if not text:
            return web.Response(status=400, text='{"error": "Missing text field"}', content_type='application/json')

        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        new_message = {'text': text, 'timestamp': timestamp}
        messages.append(new_message)
        print(f"Received message: {new_message}")

        # 新しいメッセージを全SSEクライアントに送信
        sse_data = f"data: {json.dumps(new_message)}\n\n"
        for resp in sse_connections:
            try:
                await resp.write(sse_data.encode('utf-8'))
            except Exception as e:
                print(f"Error sending to SSE client: {e}")
                # エラーが発生した接続はリストから削除することも検討

        return web.json_response({"status": "OK"})

    except json.JSONDecodeError:
        return web.Response(status=400, text='{"error": "Invalid JSON"}', content_type='application/json')
    except Exception as e:
        print(f"Error processing message POST: {e}")
        return web.Response(status=500, text='{"error": "Internal Server Error"}', content_type='application/json')

async def handle_events(request):
    """'/events' でSSE接続を処理"""
    response = web.StreamResponse(
        status=200,
        reason='OK',
        headers={'Content-Type': 'text/event-stream',
                 'Cache-Control': 'no-cache',
                 'Connection': 'keep-alive'}
    )
    await response.prepare(request)
    sse_connections.append(response)
    print(f"SSE client connected: {request.remote}")

    try:
        # 接続維持のため、定期的にコメントを送信するか、
        # またはクライアントが切断するまで待機
        while True:
            # 必要であれば、ここでキープアライブコメントを送信
            # await response.write(b': keepalive\n\n')
            await asyncio.sleep(60) # 60秒ごとにチェック or キープアライブ
            # クライアントが切断したかどうかのチェックはaiohttpが内部で行う
            # 書き込み時にエラーが発生したら切断とみなせる

    except asyncio.CancelledError:
        print("SSE handler cancelled.")
        # raise # キャンセルを伝播させる場合
    except Exception as e:
        print(f"Error in SSE connection: {e}")
    finally:
        # クライアント切断時やエラー時にリストから削除
        if response in sse_connections:
            sse_connections.remove(response)
        print(f"SSE client disconnected: {request.remote}")

    return response

async def main(host='0.0.0.0', port=5001): # ポート番号を 27099 から 5001 に戻す
    app = web.Application()
    # Jinja2テンプレートの設定
    aiohttp_jinja2.setup(app, loader=jinja2.FileSystemLoader('templates'))

    app.router.add_get('/', handle_index)
    app.router.add_post('/api/message', handle_post_message)
    app.router.add_get('/events', handle_events)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    print(f'Starting Chat Viewer server on http://{host}:{port}...')
    await site.start()

    # 中断されるまでサーバーを実行し続ける
    try:
        await asyncio.Event().wait()
    except (KeyboardInterrupt, asyncio.CancelledError):
        print("Chat Viewer server shutting down...")
    finally:
        await runner.cleanup()
        print("Chat Viewer server stopped.")

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Chat Viewer application terminated by user.")
