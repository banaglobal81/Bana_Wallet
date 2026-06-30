'use client';

import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';

export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="w-full h-full flex flex-col"
    >
      {children}
    </motion.div>
  );
}
