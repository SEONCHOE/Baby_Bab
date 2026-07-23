import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

/** 현재 로그인 유저의 내부 users.id 반환 (없으면 null) */
export async function getUserId(): Promise<number | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: number })?.id ?? null;
}
