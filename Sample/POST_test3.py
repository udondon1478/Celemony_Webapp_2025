import asyncio
import json
from datetime import datetime
from collections import defaultdict
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
import socket
import time

class DataAggregator:
    def __init__(self):
        # テキストごとの受信回数を集計
        self.text_counts = defaultdict(int)
        # テキストごとの最新タイムスタンプを保持
        self.text_timestamps = {}
        # スレッド同期用のロック
        self.lock = threading.Lock()

    def add_data(self, text, timestamp):
        with self.lock:
            self.text_counts[text] += 1
            self.text_timestamps[text] = timestamp

    def get_aggregated_data(self):
        with self.lock:
            # 現在の集計データのコピーを返却
            return {
                'counts': dict(self.text_counts),
                'timestamps': dict(self.text_timestamps)
            }

    def reset(self):
        with self.lock:
            self.text_counts.clear()
            self.text_timestamps.clear()

class RequestHandler(BaseHTTPRequestHandler):
    # クラス変数として共有
    aggregator = DataAggregator()
    udp_sender = None

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            payload = json.loads(post_data.decode('utf-8'))
            
            # イベントから必要な情報を抽出
            for event in payload.get('events', []):
                if event.get('type') == 'message' and event['message'].get('type') == 'text':
                    text = event['message']['text']
                    timestamp = event.get('timestamp', int(datetime.now().timestamp() * 1000))
                    
                    # データ集計
                    self.aggregator.add_data(text, timestamp)
                    
                    print(f"Processed text: {text}")

        except json.JSONDecodeError:
            print("Invalid JSON payload")

        # レスポンス送信
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"status": "OK"}')

class UDPSender:
    def __init__(self, aggregator, host='222.9.129.241', port=9999):
        self.aggregator = aggregator
        self.host = host
        self.port = port
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    def start_sending(self):
        while True:
            # 1秒ごとに集計データを送信
            aggregated_data = self.aggregator.get_aggregated_data()
            
            try:
                # JSON形式でデータをUDP送信
                message = json.dumps(aggregated_data).encode('utf-8')
                self.sock.sendto(message, (self.host, self.port))
                print(f"Sent UDP data: {message}")
            except Exception as e:
                print(f"UDP送信エラー: {e}")

            # Reset aggregator after sending
            self.aggregator.reset()
            
            time.sleep(1)

def run_server(server_class=HTTPServer, handler_class=RequestHandler, port=8081):
    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    
    # UDP送信スレッドの準備
    udp_sender = UDPSender(handler_class.aggregator)
    udp_thread = threading.Thread(target=udp_sender.start_sending, daemon=True)
    udp_thread.start()
    
    print(f'Starting httpd on port {port}...')
    httpd.serve_forever()

if __name__ == '__main__':
    run_server()
