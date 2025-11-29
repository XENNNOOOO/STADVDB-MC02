import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/app/components/Navbar';
import RecoveryInitializer from '@/app/components/RecoveryInitializer';

export const metadata: Metadata = {
  title: 'GO-Sales - Distributed Order Management',
  description: 'Advanced distributed database order management system',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main className="container mx-auto max-w-7xl px-8 py-8">
          {children}
        </main>
        {/* Initialize recovery automation system in the background */}
        <RecoveryInitializer />
      </body>
    </html>
  );
}
