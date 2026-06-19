import BanaLogo from '@/components/BanaLogo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#06132a] px-4 py-12">
      <div className="mb-8 pointer-events-none">
        <BanaLogo size="lg" />
      </div>
      {children}
    </div>
  );
}
