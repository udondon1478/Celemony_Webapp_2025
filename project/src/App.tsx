import * as React from 'react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smile, Send, MessageSquare } from 'lucide-react';
import GraphemeSplitter from 'grapheme-splitter';

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
const BLOCKED_EMOJI_COMBINATIONS: string[] = ["🥺👉👈"];

const MAX_DISPLAYED_EMOJIS = 200; // ★ 表示する絵文字の最大数を定義
const EMOJI_DISPLAY_DURATION = 5000; // 絵文字の表示時間 (ms)

function App() {
  const [displayedEmojis, setDisplayedEmojis] = useState<EmojiDisplay[]>([]);
  const [selectedEmoji, setSelectedEmoji] = useState(EMOJIS[0]);
  const [stats, setStats] = useState({ total: 0, current: 0 });
  const [receivedMessages, setReceivedMessages] = useState<ReceivedMessage[]>([]);

  // ★ stats.current を displayedEmojis の長さに同期させる useEffect
  useEffect(() => {
    setStats(prev => ({
      ...prev,
      current: displayedEmojis.length
    }));
  }, [displayedEmojis]); // displayedEmojis が変更されるたびに実行

  // 絵文字アニメーションをトリガーする関数
  const triggerEmojiAnimation = (emojiToDisplay: string) => {
    const minHeight = window.innerHeight * 0.2;
    const maxHeight = window.innerHeight * 0.7;
    const randomY = minHeight + Math.random() * (maxHeight - minHeight);
    const randomRotation = Math.random() * 30 - 15;

    const newEmoji: EmojiDisplay = {
      id: Date.now().toString() + Math.random(),
      emoji: emojiToDisplay,
      x: Math.random() * (window.innerWidth - 100), // 画面幅に応じて調整
      y: randomY,
      rotation: randomRotation
    };

    // ★ Stateを更新し、上限を超えたら古いものを削除
    setDisplayedEmojis(prevEmojis => {
      const updatedEmojis = [...prevEmojis, newEmoji]; // 新しい絵文字を追加
      // 上限を超えているかチェック
      if (updatedEmojis.length > MAX_DISPLAYED_EMOJIS) {
        // 上限を超えていたら、一番古いもの（配列の先頭）を削除
        return updatedEmojis.slice(1);
      }
      // 上限に達していなければ、そのまま返す
      return updatedEmojis;
    });

    // ★ 総送信数のみここでインクリメント (current は useEffect で管理)
    setStats(prev => ({ ...prev, total: prev.total + 1 }));

    // ★ 一定時間後に絵文字を削除 (削除時の current カウントは useEffect が処理)
    setTimeout(() => {
      // ID に基づいて削除する (上限削除で既に消えている可能性もあるが問題ない)
      setDisplayedEmojis(prev => prev.filter(e => e.id !== newEmoji.id));
    }, EMOJI_DISPLAY_DURATION);
  };

  // ボタンクリック時の処理
  const handleEmojiButtonClick = () => {
    triggerEmojiAnimation(selectedEmoji);
  };

  // 特殊エフェクトの確認 (変更なし)
  useEffect(() => {
    // ... (省略) ...
  }, [displayedEmojis]);

  // SSE接続とメッセージ受信 (isEmoji関数の修正を含む)
  useEffect(() => {
    console.log('Setting up EventSource...');
    let eventSource = new EventSource('/sse');

    eventSource.onopen = () => console.log('SSE connection opened');

    eventSource.onmessage = (event) => {
      try {
        // console.log('[SSE] Raw data received:', event.data); // デバッグ用
        const messageData = JSON.parse(event.data);
        // console.log('[SSE] Parsed message text:', messageData.text); // デバッグ用

        const splitter = new GraphemeSplitter();
        const graphemes = splitter.splitGraphemes(messageData.text);
        // console.log('[SSE] Graphemes:', graphemes); // デバッグ用

        // 絵文字判定ロジック (絵文字と結合文字、スペースを許容)
        const isEmojiCharacter = (grapheme: string): boolean => {
          // Unicode Emoji プロパティで判定
          if (/\p{Emoji}/u.test(grapheme)) return true;
          // Variation Selectors (絵文字の表示スタイルを変える)
          if (/[\uFE00-\uFE0F]/.test(grapheme)) return true;
          // Combining Enclosing Keycap など、単体ではEmoji判定されないが絵文字の一部となるもの
          if (/[\u20E3]/.test(grapheme)) return true;
          // Zero Width Joiner (ZWJ) - 複合絵文字用
          if (grapheme === '\u200D') return true;
          // 数字 (キーキャップ用) - 必要なら
          // if (/[0-9#*]/.test(grapheme)) return true;
          // 空白文字を許容 (絵文字間のスペースなど)
          if (/^\s+$/.test(grapheme)) return true;
          return false;
        };


        // すべての書記素が絵文字関連文字か空白かチェック
        const isEmojiOnly = graphemes.length > 0 && graphemes.every(isEmojiCharacter);
        // console.log(`[SSE] Is emoji only? ${isEmojiOnly}`); // デバッグ用

        if (isEmojiOnly) {
          // 空白を除いた絵文字構成要素の数をカウント (より正確な絵文字数)
          const emojiComponentsCount = graphemes.filter(g => !/^\s+$/.test(g) && !/[\uFE00-\uFE0F]/.test(g)).length;
          const MAX_EMOJI_COUNT_PER_MESSAGE = 5; // 1メッセージあたりの絵文字上限

          // メッセージ内の絵文字数が上限を超えていないかチェック
          if (emojiComponentsCount > MAX_EMOJI_COUNT_PER_MESSAGE) {
            console.log(`[SSE] Message exceeds emoji component count limit (${emojiComponentsCount} > ${MAX_EMOJI_COUNT_PER_MESSAGE}):`, messageData.text);
            return; // 多すぎる絵文字メッセージは無視
          }

          // ブロックリストチェック
          if (BLOCKED_EMOJI_COMBINATIONS.includes(messageData.text.trim())) { // trim() で前後の空白を除去
            console.log('[SSE] Blocked emoji combination detected:', messageData.text);
            return; // ブロック対象なら無視
          }

          // console.log('[SSE] Triggering animation for emoji string:', messageData.text); // デバッグ用
          triggerEmojiAnimation(messageData.text); // 絵文字アニメーション実行
        } else {
          // 通常メッセージ処理
          // console.log('[SSE] Adding non-emoji-only message to list:', messageData.text); // デバッグ用
          setReceivedMessages(prevMessages => {
            const updatedMessages = [messageData, ...prevMessages];
            return updatedMessages.slice(0, 10); // 最新10件のみ保持
          });
        }
      } catch (error) {
        console.error('Failed to parse SSE message data:', error, event.data);
      }
    };

    eventSource.onerror = (error) => {
      console.error('EventSource failed:', error);
      eventSource.close(); // エラー時は一旦閉じる
      // 再接続ロジック (例: 3秒後)
      setTimeout(() => {
        console.log('Attempting to reconnect SSE...');
        // 再接続処理をここに実装 (このuseEffectが再実行されるようにするか、別の方法で)
        // この例では単純化のため、再接続ロジックは省略
      }, 3000);
    };

    // クリーンアップ関数
    return () => {
      console.log('Closing EventSource connection');
      eventSource.close();
    };
  }, []); // マウント時にのみ実行

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 relative overflow-hidden flex flex-col">
      {/* 絵文字表示エリア */}
      <div className="absolute inset-0 flex-grow">
        <AnimatePresence> {/* exit アニメーションのために必要 */}
          {displayedEmojis.map(({ id, emoji, x, y, rotation }) => (
            <motion.div
              key={id} // ユニークキー
              initial={{ scale: 0, opacity: 0, x, y, rotate: rotation }}
              animate={{
                scale: 1,
                opacity: 1,
                rotate: rotation, // アニメーション中も回転を維持
                transition: { type: "spring", stiffness: 400, damping: 15 }
              }}
              exit={{ // ★ 削除（ポップアウト）時のアニメーション
                scale: [1, 1.2, 0], // 少し拡大してから消える
                opacity: [1, 0.8, 0],
                transition: { duration: 0.4, ease: "easeOut" }
              }}
              className="absolute text-6xl cursor-pointer" // サイズやスタイル調整
              style={{ x, y }} // style プロパティで直接指定
              whileHover={{ scale: 1.1 }} // ホバーエフェクト
            >
              {/* ふわふわ上下するアニメーション */}
              <motion.div
                animate={{ y: [0, -8, 0] }} // 上下に動く範囲
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              >
                {emoji} {/* 絵文字文字列を表示 */}
              </motion.div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 受信メッセージ表示エリア (変更なし) */}
      <div className="absolute bottom-32 left-4 right-4 md:left-auto md:right-4 md:w-96 h-48 bg-black bg-opacity-50 backdrop-blur-sm rounded-lg p-3 overflow-y-auto text-white shadow-xl z-10">
        {/* ... (省略) ... */}
      </div>

      {/* コントロールパネル (変更なし) */}
      <div className="absolute bottom-0 left-0 right-0 bg-white bg-opacity-90 p-6 shadow-lg z-20">
        <div className="max-w-4xl mx-auto">
          {/* ... (ボタンなど) ... */}
          <div className="flex items-center justify-between text-sm text-gray-600 mt-4"> {/* mt-4 を追加 */}
            <div className="flex items-center gap-2">
              <Smile size={16} />
              {/* ★ stats.current を表示 */}
              <span>現在の表示数: {stats.current} / {MAX_DISPLAYED_EMOJIS}</span>
            </div>
            {/* ★ stats.total を表示 */}
            <div>総送信数: {stats.total}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;