'use client';

import EmailVerification from '@/components/security/EmailVerification';

export default function AdminEmailVerificationPage() {
  return <EmailVerification settingsPath="/admin/settings" />;
}
