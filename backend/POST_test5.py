import asyncio
import json
from datetime import datetime
from aiohttp import web
from aiohttp_sse import sse_response # SSEレスポンスをインポート
import weakref # SSEクライアントを管理するために追加
from collections import defaultdict

# 接続中のSSEクライアントを保持するセット (weakrefを使用してメモリリークを防ぐ)
sse_clients = weakref.WeakSet()

# 計測対象のアルファベットとその順序を定義
TARGET_ALPHABETS = ['x', 'k', 'h', 't', 'l', 'a', 's', 'd', 'p', 'm', 'b', 'c', 'v', 'e']

class DataAggregator:
    def __init__(self):
        # アルファベットごとの受信回数を集計
        self.reset_alphabet_counts()
        # asyncio用のロック
        self.lock = asyncio.Lock()

    def reset_alphabet_counts(self):
        # 各アルファベットのカウントを0に初期化
        self.alphabet_counts = {letter: 0 for letter in TARGET_ALPHABETS}

    async def add_data(self, text, timestamp):
        """受信テキストを処理して、対象のアルファベットの出現回数をカウント"""
        async with self.lock:
            # テキストが単一文字で、かつ対象のアルファベットの場合のみカウント
            if len(text) == 1 and text.lower() in TARGET_ALPHABETS:
                self.alphabet_counts[text.lower()] += 1
                print(f"Counted alphabet: {text.lower()}, current counts: {self.alphabet_counts}")

    async def get_aggregated_data(self):
        """アルファベット出現回数を配列形式で取得"""
        async with self.lock:
            # 指定された順序でアルファベットカウントを取得（配列形式）
            counts_array = [self.alphabet_counts[letter] for letter in TARGET_ALPHABETS]
            return counts_array

    async def reset(self):
        """カウントデータをリセット"""
        async with self.lock:
            self.reset_alphabet_counts()

class AsyncUDPSender:
    def __init__(self, aggregator, host='222.9.129.241', port=9999):
        self.aggregator = aggregator
        self.host = host
        self.port = port
        self.transport = None
        self.protocol = None

    async def start_sending(self):
        loop = asyncio.get_running_loop()
        
# データグラムエンドポイントを作成します。可能であれば再利用します。
        try:
            self.transport, self.protocol = await loop.create_datagram_endpoint(# データグラムエンドポイントを作成。可能であれば再利用。
                lambda: asyncio.DatagramProtocol(), # UDPプロトコルを使用
                remote_addr=(self.host, self.port)
            )
            print(f"UDP Sender connected to {self.host}:{self.port}")
        except Exception as e:
            print(f"Failed to create UDP endpoint: {e}")
            return # 接続に失敗した場合は停止

        while True:
            print("[UDP Loop] Starting iteration.")
            try:
                # 1秒ごとに集計データを送信
                counts_array = await self.aggregator.get_aggregated_data()
                
                # カウントが0でない場合に送信（全て0の場合も送信する場合はこの条件を削除）
                if any(counts_array) or True:  # 常に送信する場合
                    try:
                        # 配列をJSON文字列に変換して送信
                        message = json.dumps(counts_array).encode('utf-8')
                        self.transport.sendto(message)
                        print(f"Sent UDP data: {message.decode('utf-8')}")
                    except Exception as e:
                        print(f"UDP送信エラー: {e}")
                        # 送信に失敗した場合（例：ネットワークの問題）に再接続を試みる
                        try:
                            self.transport.close()
                            self.transport, self.protocol = await loop.create_datagram_endpoint(
                                lambda: asyncio.DatagramProtocol(),
                                remote_addr=(self.host, self.port)
                            )
                            print("Re-established UDP connection.")
                        except Exception as recon_e:
                            print(f"Failed to re-establish UDP connection: {recon_e}")
                            await asyncio.sleep(5) # 接続を再試行する前に待機

                # 送信後にアグリゲーターをリセット
                await self.aggregator.reset()

                # 1秒待機
                await asyncio.sleep(1)

            except asyncio.CancelledError:
                print("UDP sender task cancelled.")
                if self.transport:
                    self.transport.close()
                break
            except Exception as e:
                print(f"Error in UDP sending loop: {e}")
                await asyncio.sleep(1) # 予期せぬエラーでのタイトなループを回避

async def send_sse_message(text):
    """接続中の全てのSSEクライアントにメッセージを送信する"""
    message_data = json.dumps({"text": text, "timestamp": datetime.now().isoformat()})
    clients_to_remove = set()
    for client in list(sse_clients):
        try:
            await client.send(message_data)
        except ConnectionResetError:
            print(f"Client connection reset. Removing client: {client}")
            clients_to_remove.add(client)
        except Exception as e:
            print(f"Error sending message to SSE client {client}: {e}")
            clients_to_remove.add(client)

    for client in clients_to_remove:
        sse_clients.discard(client)

async def handle_post(request):
    print("[handle_post] Received request.")
    try:
        post_data = await request.read()
        print(f"[handle_post] Read request body: {len(post_data)} bytes.")
        payload = json.loads(post_data.decode('utf-8'))
        print("[handle_post] Parsed JSON payload.")

        # イベントから必要な情報を抽出
        for event in payload.get('events', []):
            print(f"[handle_post] Processing event: type={event.get('type')}")
            if event.get('type') == 'message' and event['message'].get('type') == 'text':
                text = event['message']['text']
                # LINE Platformからのタイムスタンプを使用、なければ現在時刻
                timestamp = event.get('timestamp', int(datetime.now().timestamp() * 1000))
                
                # データ集計 (単一のアルファベットの場合のみカウント)
                await request.app['aggregator'].add_data(text, timestamp)
                
                # SSEクライアントにメッセージを送信（全てのメッセージを送信）
                await send_sse_message(text)
                print(f"Processed text: {text}")

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
            # aiohttp-sse の sse_response が接続を管理するため、
            # 明示的なループは不要。接続が切れるまで待機する。
            # 必要であれば、ここで初期メッセージなどを送信できる。
            # 例: await resp.send(json.dumps({"type": "welcome", "message": "Connected!"}))
            await asyncio.Event().wait() # Keep the handler alive until disconnected

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
    # 共有アグリゲーターインスタンスを作成
    aggregator = DataAggregator()

    # UDP送信インスタンスを作成
    udp_sender = AsyncUDPSender(aggregator)

    # aiohttpアプリケーションを作成
    app = web.Application()
    app['aggregator'] = aggregator # アプリケーションの状態にアグリゲーターを保存

    # ルートを追加
    app.router.add_post('/test', handle_post) # POSTリクエスト用
    app.router.add_get('/sse', sse_handler)   # SSE接続用

    # Webサーバーを作成して実行
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)

    # UDP送信タスクを開始
    udp_task = asyncio.create_task(udp_sender.start_sending())

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
        udp_task.cancel()
        await udp_task # UDPタスクのキャンセル完了を待つ
        await runner.cleanup()
        print("Server stopped.")

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Application terminated by user.")
