import * as React from 'react'; // Reactのインポート形式を変更
import { useState, useEffect } from 'react'; // useState, useEffect はそのまま
import { motion, AnimatePresence } from 'framer-motion';
import { Smile, Send, MessageSquare } from 'lucide-react';
import GraphemeSplitter from 'grapheme-splitter';// MessageSquare を追加

// 受信メッセージの型定義
interface ReceivedMessage {
  text: string;
  timestamp: string;
}

interface EmojiDisplay {
  id: string;
  emoji: string;
  x: number;
  y: number;
  rotation: number;
}

const EMOJIS = ['😊', '🎉', '💖', '✨', '🌟', '🎈', '🎪', '🎭', '🎨', '🎡'];
const SPECIAL_COMBINATIONS = {
  '🎉💖': '特別なエフェクト1',
  '✨🌟': '特別なエフェクト2',
  '🎨🎭': '特別なエフェクト3'
};

// アニメーション表示をブロックしたい絵文字の組み合わせリスト
// 例: ["💖✨", "🚫👎"] など。管理者はこのリストを編集します。
const BLOCKED_EMOJI_COMBINATIONS: string[] = ["🥺👉👈"]; // 例として一つ追加

function App() {
  const [displayedEmojis, setDisplayedEmojis] = useState<EmojiDisplay[]>([]);
  const [selectedEmoji, setSelectedEmoji] = useState(EMOJIS[0]);
  const [stats, setStats] = useState({ total: 0, current: 0 });
  const [receivedMessages, setReceivedMessages] = useState<ReceivedMessage[]>([]); // SSEメッセージ用Stateを追加

  // 絵文字アニメーションをトリガーする関数
  const triggerEmojiAnimation = (emojiToDisplay: string) => {
    // ランダムな位置と回転を計算
    const minHeight = window.innerHeight * 0.2; // 画面の上部20%
    const maxHeight = window.innerHeight * 0.7; // 画面の上部70%
    const randomY = minHeight + Math.random() * (maxHeight - minHeight);
    const randomRotation = Math.random() * 30 - 15; // -15度から15度の範囲

    const newEmoji: EmojiDisplay = {
      id: Date.now().toString() + Math.random(), // IDのユニーク性を高める
      emoji: emojiToDisplay, // 文字列全体を受け取るように変更済み
      x: Math.random() * (window.innerWidth - 100),
      y: randomY,
      rotation: randomRotation
    };

    setDisplayedEmojis((prev: EmojiDisplay[]) => [...prev, newEmoji]);
    setStats((prev: { total: number, current: number }) => ({ ...prev, total: prev.total + 1, current: prev.current + 1 }));

    // 数秒後に絵文字を削除
    setTimeout(() => {
      setDisplayedEmojis((prev: EmojiDisplay[]) => prev.filter((e: EmojiDisplay) => e.id !== newEmoji.id));
      setStats((prev: { total: number, current: number }) => ({ ...prev, current: prev.current - 1 }));
    }, 5000); // アニメーション表示時間
  };

  // ボタンクリック時の処理 (リファクタリング)
  const handleEmojiButtonClick = () => {
    triggerEmojiAnimation(selectedEmoji);
  };

  const addEmoji = () => { // addEmoji は古いコードとの互換性のため残すか、完全に handleEmojiButtonClick に置き換える
    handleEmojiButtonClick();
  };

  // 特殊エフェクトの確認
  useEffect(() => {
    const lastTwo = displayedEmojis.slice(-2).map((e: EmojiDisplay) => e.emoji).join('');
    if (SPECIAL_COMBINATIONS[lastTwo as keyof typeof SPECIAL_COMBINATIONS]) {
      console.log(SPECIAL_COMBINATIONS[lastTwo as keyof typeof SPECIAL_COMBINATIONS]);
      // ここで特殊エフェクトのアニメーションを追加できます
    }
  }, [displayedEmojis]);

  // SSE接続とメッセージ受信のためのuseEffect
  useEffect(() => {
    console.log('Setting up EventSource...');
    let eventSource = new EventSource('/sse'); // バックエンドのSSEエンドポイント

    eventSource.onopen = () => {
      console.log('SSE connection opened');
    };

    eventSource.onmessage = (event) => {
      try {
        console.log('[SSE] Raw data received:', event.data);
        // Extract data from SSE event
        const messageData = event.data.substring(event.data.indexOf("{"));
        const newMessage: ReceivedMessage = JSON.parse(messageData);
        console.log('[SSE] Parsed message text:', newMessage.text);

        const splitter = new GraphemeSplitter();
        const graphemes = splitter.splitGraphemes(newMessage.text);
        const emojiCount = graphemes.length;

        // Check if the string contains ONLY emojis, punctuation, and whitespace
        const isEmojiOnly = !/[^\p{Emoji}\p{Punctuation}\s]/u.test(newMessage.text);

        console.log(`[SSE] Is emoji only? (GraphemeSplitter):`, isEmojiOnly);

        if (isEmojiOnly) {
          // NEW: Maximum allowed emoji count (5 emojis)
          const MAX_EMOJI_COUNT = 5;
          if (emojiCount > MAX_EMOJI_COUNT) {
            console.log(`[SSE] Message exceeds emoji count limit (${emojiCount} > ${MAX_EMOJI_COUNT}):`, newMessage.text);
            return;
          }

          // Blocklist check
          if (BLOCKED_EMOJI_COMBINATIONS.includes(newMessage.text)) {
            console.log('[SSE] Blocked emoji combination detected:', newMessage.text);
            // ブロック対象の場合は何もしない (アニメーションもリスト追加もしない)
          } else {
            // ブロック対象でない場合、文字列全体を一つの塊としてアニメーションをトリガー
            console.log('[SSE] Triggering animation for emoji string:', newMessage.text);
            triggerEmojiAnimation(newMessage.text); // 文字列全体を渡す
            // この場合、受信メッセージ欄には追加しない
          }
        } else {
          // 通常のメッセージとして表示 (絵文字以外が含まれる場合)
          console.log('[SSE] Adding non-emoji-only message to list:', newMessage.text);
          setReceivedMessages((prevMessages: ReceivedMessage[]) => {
            const updatedMessages = [newMessage, ...prevMessages];
            return updatedMessages.slice(0, 10); // 表示件数を制限
          });
        }
      } catch (error) {
        console.error('Failed to parse SSE message data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('EventSource failed:', error);
      // エラー発生時、接続を再試行する
      setTimeout(() => {
        console.log('Attempting to reconnect...');
        eventSource = new EventSource('/sse');
      }, 3000); // 3秒後に再接続を試みる
    };

    // コンポーネントのアンマウント時に接続を閉じる
    return () => {
      console.log('Closing EventSource connection');
      eventSource.close();
    };
  }, []); // 空の依存配列でマウント時にのみ実行

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 relative overflow-hidden flex flex-col">
      {/* 絵文字表示エリア (flex-growで残りのスペースを埋める) */}
      <div className="absolute inset-0 flex-grow">
        <AnimatePresence>
          {displayedEmojis.map(({ id, emoji, x, y, rotation }) => (
            <motion.div
              key={id}
              initial={{
                scale: 0,
                opacity: 0,
                x,
                y,
                rotate: rotation
              }}
              animate={{
                scale: 1,
                opacity: 1,
                rotate: rotation,
                transition: {
                  type: "spring",
                  stiffness: 400,
                  damping: 15
                }
              }}
              exit={{
                scale: 0,
                opacity: 0,
                transition: {
                  duration: 0.5,
                  ease: "easeOut"
                }
              }}
              className="absolute text-6xl" // サイズ調整が必要な場合がある
              style={{ x, y }}
              whileHover={{ scale: 1.2 }}
            >
              <motion.div
                animate={{
                  y: [0, -10, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                {emoji} {/* 文字列全体を表示 */}
              </motion.div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 受信メッセージ表示エリア (画面下部、コントロールパネルの上) */}
      <div className="absolute bottom-32 left-4 right-4 md:left-auto md:right-4 md:w-96 h-48 bg-black bg-opacity-50 backdrop-blur-sm rounded-lg p-3 overflow-y-auto text-white shadow-xl z-10">
        <h2 className="text-sm font-semibold mb-2 border-b border-gray-400 pb-1 flex items-center gap-1">
          <MessageSquare size={14} />
          受信メッセージ
        </h2>
        {receivedMessages.length === 0 ? (
          <p className="text-xs text-gray-300 italic">メッセージ待機中...</p>
        ) : (
          <AnimatePresence initial={false}>
            {receivedMessages.map((msg: ReceivedMessage, index: number) => (
              <motion.div
                key={msg.timestamp + index} // よりユニークなキー
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="text-xs mb-1 border-b border-gray-600 pb-1 last:border-b-0"
              >
                <span className="text-gray-400 mr-1">[{new Date(msg.timestamp).toLocaleTimeString()}]</span>
                <span>{msg.text}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>


      {/* コントロールパネル (z-indexでメッセージエリアより手前に) */}
      <div className="absolute bottom-0 left-0 right-0 bg-white bg-opacity-90 p-6 shadow-lg z-20">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-grow grid grid-cols-5 sm:grid-cols-10 gap-2"> {/* flex-1 を flex-grow に変更 */}
              {EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => setSelectedEmoji(emoji)}
                  className={`text-2xl p-2 rounded-lg transition-all ${selectedEmoji === emoji
                    ? 'bg-purple-500 scale-110'
                    : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <button
              onClick={handleEmojiButtonClick} // addEmoji を handleEmojiButtonClick に変更
              className="bg-purple-500 text-white px-6 py-3 rounded-full flex items-center gap-2 hover:bg-purple-600 transition-colors"
            >
              <Send size={20} />
              <span>送信</span>
            </button>
          </div>

          {/* 統計情報 */}
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Smile size={16} />
              <span>現在の表示数: {stats.current}</span>
            </div>
            <div>総送信数: {stats.total}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
