import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';

export default async function Home() {
  const locale = await getLocale();
  const session = await auth();
  if (!session?.user) redirect({ href: '/login', locale });
  redirect({ href: session.user.role === 'ADMIN' ? '/admin/dashboard' : '/portfolio', locale });
}
