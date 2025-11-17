import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/app/components/Navbar';

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
      </body>
    </html>
  );
}
