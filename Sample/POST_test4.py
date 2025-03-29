import asyncio
import json
from datetime import datetime
from collections import defaultdict
import socket
from aiohttp import web

class DataAggregator:
    def __init__(self):
        # テキストごとの受信回数を集計
        self.text_counts = defaultdict(int)
        # テキストごとの最新タイムスタンプを保持
        self.text_timestamps = {}
        # asyncio用のロック
        self.lock = asyncio.Lock()

    async def add_data(self, text, timestamp):
        async with self.lock:
            self.text_counts[text] += 1
            self.text_timestamps[text] = timestamp

    async def get_aggregated_data(self):
        async with self.lock:
            # 現在の集計データのコピーを返却
            return {
                'counts': dict(self.text_counts),
                'timestamps': dict(self.text_timestamps)
            }

    async def reset(self):
        async with self.lock:
            self.text_counts.clear()
            self.text_timestamps.clear()

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
            self.transport, self.protocol = await loop.create_datagram_endpoint(
                lambda: asyncio.DatagramProtocol(), # 基本的なプロトコル
                remote_addr=(self.host, self.port)
            )
            print(f"UDP Sender connected to {self.host}:{self.port}")
        except Exception as e:
            print(f"Failed to create UDP endpoint: {e}")
            return # 接続に失敗した場合は停止

        while True:
            print("[UDP Loop] Starting iteration.") # ログ追加
            try:
                # 1秒ごとに集計データを送信
                aggregated_data = await self.aggregator.get_aggregated_data()
                print(f"[UDP Loop] Aggregated data check: counts={len(aggregated_data.get('counts', {}))}") # ログ追加

                if aggregated_data['counts']: # データがある場合のみ送信
                    try:
                        # JSON形式でデータをUDP送信
                        message = json.dumps(aggregated_data).encode('utf-8')
                        self.transport.sendto(message)
                        print(f"Sent UDP data: {message.decode('utf-8')}") # 可読性のためにデコードされたメッセージをログに記録
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

                    # 送信試行後にアグリゲーターをリセット
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


async def handle_post(request):
    print("[handle_post] Received request.") # ログ追加
    aggregator = request.app['aggregator']
    try:
        post_data = await request.read()
        print(f"[handle_post] Read request body: {len(post_data)} bytes.") # ログ追加
        payload = json.loads(post_data.decode('utf-8'))
        print("[handle_post] Parsed JSON payload.") # ログ追加

        # イベントから必要な情報を抽出
        for event in payload.get('events', []):
            print(f"[handle_post] Processing event: type={event.get('type')}") # ログ追加
            if event.get('type') == 'message' and event['message'].get('type') == 'text':
                text = event['message']['text']
                # LINE Platformからのタイムスタンプを使用、なければ現在時刻
                timestamp = event.get('timestamp', int(datetime.now().timestamp() * 1000))

                # データ集計 (非同期呼び出し)
                await aggregator.add_data(text, timestamp)

                print(f"Processed text: {text}")

    except json.JSONDecodeError:
        print("Invalid JSON payload received")
        return web.Response(status=400, text='{"status": "Invalid JSON"}', content_type='application/json')
    except Exception as e:
        print(f"Error processing POST request: {e}")
        return web.Response(status=500, text='{"status": "Internal Server Error"}', content_type='application/json')

    # レスポンス送信
    return web.json_response({"status": "OK"})

async def main(host='0.0.0.0', port=8081):
    # 共有アグリゲーターインスタンスを作成
    aggregator = DataAggregator()

    # UDP送信インスタンスを作成
    udp_sender = AsyncUDPSender(aggregator)

    # aiohttpアプリケーションを作成
    app = web.Application()
    app['aggregator'] = aggregator # アプリケーションの状態にアグリゲーターを保存

    # POSTルートを追加
    app.router.add_post('/test', handle_post) # Nginxプロキシ用に/testパスでリッスン

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
