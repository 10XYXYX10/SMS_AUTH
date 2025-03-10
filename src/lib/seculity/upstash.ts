import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { cookies } from "next/headers";

//////////
//■[ UpstashでrateLimitを実装 ]
//＊https://claude.ai/chat/8504a412-36aa-4e6a-b204-908030a3361f
//・Redisクライアントの作成
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});
//・レートリミットの設定（5リクエスト/10分）
const ratelimitConfig = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(
    5, 
    '10m'//`${number} ms` | `${number} s` | `${number} m` | `${number} h` | `${number} d` | `${number}ms` | `${number}s` | `${number}m` | `${number}h` | `${number}d`
  ),
  analytics: true,
});
//・rateLimit
export async function rateLimit() {
  // ユーザー識別子（例：IPアドレス、セッションID、ユーザーIDなど）
  // 今回は、cookieからセッションIDを取得する
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session-id')?.value || 'anonymous';

  // レートリミットのチェック
  const { success, limit, reset, remaining } = await ratelimitConfig.limit(
    `submit_form_${sessionId}`
  );
  console.log(`success:${success}`)
  console.log(`limit,:${limit}`)
  console.log(`reset:${reset}`)
  console.log(`remaining:${remaining}`)

  if (!success) {
    // レート制限に達した場合
    return {
      success:false, 
      message:`Too many requests. Please try again after ${Math.ceil((reset - Date.now()) / 1000)} seconds.`
    };
  }

  // 処理結果を返す
  return { success: true, message: 'Form submitted successfully' };
}