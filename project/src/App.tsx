import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react'; // useRef, useCallback を追加
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
const BLOCKED_EMOJI_COMBINATIONS: string[] = [""];

const BLOCKED_SINGLE_EMOJIS: string[] = [
  // --- ネガティブな感情 ---
  //'😭', // 号泣
  //'😢', // 泣き顔
  //'😥', // 悲しいけど安堵
  '😠', // 怒り顔
  '😡', // 激怒
  '🤬', // 汚い言葉を使う顔
  '😤', // ぷんぷん
  '💔', // 失恋・壊れたハート
  '👎', // サムズダウン
  '😩', // うんざり
  '😫', // 疲れた顔
  //'😖', // 困惑
  //'😣', // 我慢
  //'😞', // がっかり
  //'😟', // 心配
  //'🙁', // 少し悲しい顔
  //'☹️', // 悲しい顔
  //'😨', // 恐怖
  //'😱', // 恐怖で叫ぶ顔
  //'😰', // 冷や汗
  //'😓', // 汗

  // --- 病気・怪我 ---
  '🤢', // 吐き気
  '🤮', // 嘔吐
  '🤧', // くしゃみ
  '🤕', // 頭に包帯
  '🤒', // 体温計（病気）
  '🥶', // 凍える顔 (不快感)
  '🥵', // 暑い顔 (不快感)
  '🩸', // 血
  '🩹', // 絆創膏

  // --- 感情 ---
  '💢', //怒りマーク
  '🕳️', // 穴 (無関心・無視)


  // --- 死・不吉 ---
  '💀', // ドクロ
  '☠️', // ドクロと骨
  '⚰️', // 棺桶
  '⚱️', // 骨壷
  '👻', // おばけ (文脈によるが、死を連想させることがある)
  '🔪', // 包丁 (暴力)
  '💣', // 爆弾 (破壊)
  '💥', // 衝突・爆発
  '🔫', // ピストル (暴力)
  '🪦', // 墓石

  // --- 皮肉・軽蔑・無関心 ---

  '😒', // 不満顔
  '🙄', // 目を回す (呆れ)
  '🤦‍♀️', // フェイスパーム（女性）
  '🤦‍♂️', // フェイスパーム（男性）
  '🤷‍♀️', // 肩をすくめる（女性）(無関心・知らない)
  '🤷‍♂️', // 肩をすくめる（男性）(無関心・知らない)
  //'🤔', // 考え中 (疑い・不確かさ)
  '👀', // 目 (詮索・じろじろ見る)

  // --- 下品・不快 ---
  '💩', // うんち
  '🖕', // 中指

  // --- その他不適切 ---
  '❌', // バツ印
  '📉', // 下降グラフ (失敗・悪化)
  '⛈️', // 雷雨 (不吉・困難)
  '⛓️', // 鎖 (束縛・不自由)
  '🤡', // ピエロ (嘲笑・馬鹿にする)
  '🚬', // 煙草 (健康に悪い)

  // --- 性的・暴力的な内容 ---
  '🍑', // 桃 (性的な意味)
  '🍆', // 茄子 (性的な意味)
  '💋', // キス (性的な意味)
  '🍌', // バナナ (性的な意味)
  '🍒', // チェリー (性的な意味)
  '🏩', // ラブホテル (性的な意味)
  '🏨', // ホテル (性的な意味)
  '💒', // 結婚式場(誤解の恐れ)

  // --- 人物 ---
  '🙍', //しかめっ面の人	
  '🙍‍♂️', // 男性のしかめっ面
  '🙍‍♀️', // 女性のしかめっ面
  '🙅', // NO!のポーズ
  '🙅‍♂️', // 男性のNO!のポーズ
  '🙅‍♀️', // 女性のNO!のポーズ
  '🤦', // 顔を手で覆う人	
  '🤦‍♂️', // 男性の顔を手で覆う
  '🤦‍♀️', // 女性の顔を手で覆う
  '👯', //バニー姿の人
  '👯‍♂️', // 男性のバニー姿
  '👯‍♀️', // 女性のバニー姿

  // --- 動物 ---
  '🪳', // ゴキブリ

  // --- 記号 ---
  '🔞', // 成人向けコンテンツ
  '☢', // 放射能マーク
  '☣', // バイオハザードマーク


  // --- 国旗 (思想信条に関わる可能性) ---
  // 主要な国旗や地域旗の例。必要に応じて追加・削除してください。
  // 全ての国旗を網羅するのは現実的ではないため、代表的なものをリストアップしています。
  /*'🇯🇵', '🇺🇸', '🇨🇳', '🇰🇷', '🇬🇧', '🇫🇷', '🇩🇪', '🇮🇹', '🇷🇺', '🇨🇦',
  '🇦🇺', '🇧🇷', '🇮🇳', '🇿🇦', '🇪🇸', '🇲🇽', '🇸🇦', '🇦🇪', '🇹🇷', '🇻🇳',
  '🇹🇭', '🇵🇭', '🇲🇾', '🇮🇩', '🇪🇬', '🇳🇬', '🇰🇪', '🇦🇷', '🇨🇱', '🇵🇪',
  '🇨🇴', '🇺🇾', '🇵🇾', '🇻🇪', '🇧🇪', '🇳🇱', '🇧🇬', '🇭🇺', '🇷🇸', '🇦🇹',
  '🇨🇿', '🇸🇰', '🇭🇷', '🇧🇦', '🇲🇩', '🇲🇰', '🇦🇱', '🇧🇬', '🇪🇺', // EU*/

  //以下の二つは自由な要素のため、全ての国旗のブラックリストに含んでいない、有効化する場合はコメントアウトを外してください。
  // '🇺🇳', // 国連 (国際組織)
  // '🇦🇶', // 南極

  // 上記を無視して全ての国旗の絵文字を記述
  '🇦🇨', '🇦🇩', '🇦🇪', '🇦🇫', '🇦🇬', '🇦🇮', '🇦🇱', '🇦🇲', '🇦🇴', '🇦🇷', '🇦🇸', '🇦🇹', '🇦🇺', '🇦🇼', '🇦🇽', '🇦🇿', '🇧🇦', '🇧🇧', '🇧🇩', '🇧🇪', '🇧🇫', '🇧🇬', '🇧🇭', '🇧🇮', '🇧🇯', '🇧🇱', '🇧🇲', '🇧🇳', '🇧🇴', '🇧🇶', '🇧🇷', '🇧🇸', '🇧🇹', '🇧🇻', '🇧🇼', '🇧🇾', '🇧🇿', '🇨🇦', '🇨🇨', '🇨🇩', '🇨🇫', '🇨🇬', ''

  '🏳️‍🌈', // レインボーフラッグ (LGBTQ+)
  '🏳️‍⚧️', // トランスジェンダーフラッグ
  '🏴‍☠️', // 海賊旗 (海賊)
  '🏳️', // 白旗 (降伏のイメージ)
  '🏴', // 黒旗 (無政府主義、海賊など)
  '🎌', // 日の丸の旗 (特定の文脈)
  // ... 他の国旗や地域旗も必要であれば追加 ...
  // Unicode の Regional Indicator Symbols (U+1F1E6 から U+1F1FF) の
  // 組み合わせで表現される全ての国旗をブロック対象とする考え方もありますが、
  // リストとして保持する場合は代表的なものを挙げる形になります。

  // 必要であれば、さらに追加
]; // 単一ブロック絵文字リスト

const MAX_DISPLAYED_EMOJIS = 200; // 表示する絵文字の最大数を定義
const EMOJI_DISPLAY_DURATION = 5000; // 絵文字の表示時間 (ms)
const THROTTLE_INTERVAL = 500; // ★ キュー処理の間隔 (ミリ秒) - この値を調整
const MAX_QUEUE_SIZE = 20; // ★ キューの最大サイズ

function App() {
  const [displayedEmojis, setDisplayedEmojis] = useState<EmojiDisplay[]>([]);
  const [selectedEmoji, setSelectedEmoji] = useState(EMOJIS[0]);
  const [stats, setStats] = useState({ total: 0, current: 0 });
  const [receivedMessages, setReceivedMessages] = useState<ReceivedMessage[]>([]);

  // ★ キューとスロットリングのための Ref を追加
  const emojiQueueRef = useRef<string[]>([]); // 絵文字文字列を溜めるキュー
  const isProcessingQueueRef = useRef<boolean>(false); // 現在キューを処理中かどうかのフラグ
  const throttleTimerRef = useRef<NodeJS.Timeout | null>(null); // スロットリング用タイマー

  // stats.current の更新 (変更なし)
  useEffect(() => {
    setStats(prev => ({ ...prev, current: displayedEmojis.length }));
  }, [displayedEmojis]);

  // ★ 絵文字を実際に表示する内部関数 (元の triggerEmojiAnimation のコアロジック)
  const displaySingleEmoji = useCallback((emojiToDisplay: string) => {
    const minHeight = window.innerHeight * 0.05; // 5% から
    const maxHeight = window.innerHeight * 0.95; // 95% まで
    const randomY = minHeight + Math.random() * (maxHeight - minHeight);
    const randomRotation = Math.random() * 30 - 15;

    const newEmoji: EmojiDisplay = {
      id: Date.now().toString() + Math.random(),
      emoji: emojiToDisplay,
      x: Math.random() * (window.innerWidth - 100),
      y: randomY,
      rotation: randomRotation
    };

    // State更新 (上限チェック含む)
    setDisplayedEmojis(prevEmojis => {
      const updatedEmojis = [...prevEmojis, newEmoji];
      return updatedEmojis.length > MAX_DISPLAYED_EMOJIS
        ? updatedEmojis.slice(updatedEmojis.length - MAX_DISPLAYED_EMOJIS) // ★ 常に末尾MAX個を保持するように変更 (slice(1)だと古いものが残る可能性)
        : updatedEmojis;
    });

    // 総送信数インクリメント
    setStats(prev => ({ ...prev, total: prev.total + 1 })); // 総送信数はキューに入った時点 or 表示された時点、どちらが良いか要件次第。ここでは表示時点。

    // 一定時間後に削除
    setTimeout(() => {
      setDisplayedEmojis(prev => prev.filter(e => e.id !== newEmoji.id));
    }, EMOJI_DISPLAY_DURATION);
  }, []); // 依存配列を空に (内部で使う State や Props がないため)

  // ★ キューを処理する関数 (スロットリングされる)
  const processEmojiQueue = useCallback(() => {
    if (isProcessingQueueRef.current || emojiQueueRef.current.length === 0) {
      // 既に処理中か、キューが空なら何もしない
      throttleTimerRef.current = null; // タイマーをリセット
      return;
    }

    isProcessingQueueRef.current = true; // 処理開始フラグ

    // requestAnimationFrame を使って、ブラウザの描画タイミングに合わせて処理
    // これにより、一度に大量処理するのではなく、少しずつ処理を分散できる
    requestAnimationFrame(() => {
      const emojisToProcess = [...emojiQueueRef.current]; // 現在のキューをコピー
      emojiQueueRef.current = []; // 元のキューを空にする

      // console.log(`[Queue] Processing ${emojisToProcess.length} emojis.`); // デバッグ用

      // キュー内の絵文字を順番に表示
      // 注意: 一度の処理で大量の絵文字を displaySingleEmoji に渡すと
      // 結局 setDisplayedEmojis が連続で呼ばれる可能性がある。
      // さらに負荷を下げるなら、一度の processEmojiQueue で処理する数を制限するなどの工夫も可能。
      emojisToProcess.forEach(emoji => {
        displaySingleEmoji(emoji);
      });

      isProcessingQueueRef.current = false; // 処理完了フラグ

      // キューがまだ残っていれば、次のインターバルで再度処理を試みる
      if (emojiQueueRef.current.length > 0) {
        if (!throttleTimerRef.current) { // タイマーがなければ再セット
          throttleTimerRef.current = setTimeout(processEmojiQueue, THROTTLE_INTERVAL);
        }
      } else {
        throttleTimerRef.current = null; // キューが空ならタイマー不要
      }
    });

  }, [displaySingleEmoji]); // displaySingleEmoji が変わらない限り再生成されない


  // ★ SSEメッセージをキューに追加し、処理をトリガーする関数
  const enqueueEmoji = useCallback((emoji: string) => {
    // ★ キューサイズチェックと古い要素の削除
    if (emojiQueueRef.current.length >= MAX_QUEUE_SIZE) {
      emojiQueueRef.current.shift(); // 古い絵文字を削除
      // console.log(`[Queue] Removed oldest emoji due to size limit.`); // デバッグ用
    }
    emojiQueueRef.current.push(emoji); // 新しい絵文字を追加
    // console.log(`[Queue] Added: ${emoji}. Queue size: ${emojiQueueRef.current.length}`); // デバッグ用

    // スロットリングタイマーがセットされていなければ、処理を開始するタイマーをセット
    if (!throttleTimerRef.current && !isProcessingQueueRef.current) {
      throttleTimerRef.current = setTimeout(processEmojiQueue, THROTTLE_INTERVAL);
    }
  }, [processEmojiQueue]); // processEmojiQueue が変わらない限り再生成されない

  // ボタンクリック時の処理 (直接表示)
  const handleEmojiButtonClick = () => {
    // ボタンからの送信は即時反映させるため、直接 displaySingleEmoji を呼ぶ
    displaySingleEmoji(selectedEmoji);
  };

  // 特殊エフェクトの確認
  useEffect(() => {
    const lastTwo = displayedEmojis.slice(-2).map((e: EmojiDisplay) => e.emoji).join('');
    if (SPECIAL_COMBINATIONS[lastTwo as keyof typeof SPECIAL_COMBINATIONS]) {
      console.log(SPECIAL_COMBINATIONS[lastTwo as keyof typeof SPECIAL_COMBINATIONS]);
      // ここで特殊エフェクトのアニメーションを追加できます
    }
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

          // ★ 追加: 単一絵文字ブロックリストチェック
          const containsBlockedSingleEmoji = graphemes.some(grapheme =>
            BLOCKED_SINGLE_EMOJIS.includes(grapheme)
          );
          if (containsBlockedSingleEmoji) {
            console.log('[SSE] Blocked single emoji detected in message:', messageData.text);
            return; // ブロック対象の単一絵文字が含まれていたら無視
          }

          // 組み合わせブロックリストチェック
          if (BLOCKED_EMOJI_COMBINATIONS.includes(messageData.text.trim())) { // trim() で前後の空白を除去
            console.log('[SSE] Blocked emoji combination detected:', messageData.text);
            return; // ブロック対象なら無視
          }

          // console.log('[SSE] Triggering animation for emoji string:', messageData.text); // デバッグ用
          // ★ triggerEmojiAnimation の代わりに enqueueEmoji を呼び出す
          enqueueEmoji(messageData.text);

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
      // ★ コンポーネントアンマウント時にタイマーをクリア
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
      }
    };
    // ★ enqueueEmoji を依存配列に追加 (useCallback でラップしたので通常は再生成されない)
  }, [enqueueEmoji]);

  return (
    <div className="min-h-screen  relative overflow-hidden flex flex-col">
      {/* この後ろのクラスは初期に実装されていたグラデーション、もし有効化するなら上のクラスを消して後ろを有効化 */}{/* <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 relative overflow-hidden flex flex-col"> */}
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
              className="absolute text-3xl cursor-pointer" // サイズやスタイル調整
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

      {/* 
      // 受信メッセージ表示エリア (画面下部、コントロールパネルの上)
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

      // コントロールパネル (z-indexでメッセージエリアより手前に)
      <div className="absolute bottom-0 left-0 right-0 bg-white bg-opacity-90 p-6 shadow-lg z-20">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-4">
        <div className="flex-grow grid grid-cols-5 sm:grid-cols-10 gap-2"> 
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
          onClick={handleEmojiButtonClick}
          className="bg-purple-500 text-white px-6 py-3 rounded-full flex items-center gap-2 hover:bg-purple-600 transition-colors"
        >
          <Send size={20} />
          <span>送信</span>
        </button>
          </div>

          // 統計情報
          <div className="flex items-center justify-between text-sm text-gray-600 mt-4">
        <div className="flex items-center gap-2">
          <Smile size={16} />
          <span>現在の表示数: {stats.current} / {MAX_DISPLAYED_EMOJIS}</span>
        </div>
        <div>総送信数: {stats.total}</div>
          </div>
        </div>
      </div >
      */}
    </div >
  );
}

export default App;
