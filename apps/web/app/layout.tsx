import './globals.css';
import React from 'react';
import { Providers } from '@/components/common/Providers';

export const metadata = {
  title: 'Exprest — Live Train Tracking & Journey Intelligence',
  description: 'Know where your train is, what happens next, and what surrounds the journey — in one calm interface.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com" rel="preconnect"/>
        <link crossOrigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;450;500;600;620;650;700&display=swap" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
        <style dangerouslySetInnerHTML={{__html: `
          .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
            display: inline-block;
            vertical-align: middle;
            line-height: 1;
          }
          .card-lift {
            box-shadow: 0 1px 3px rgba(0,0,0,0.02), 0 6px 18px rgba(0,0,0,0.03);
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          }
          .card-lift:hover {
            box-shadow: 0 4px 12px rgba(0,0,0,0.04), 0 12px 28px rgba(0,0,0,0.06);
            transform: translateY(-2px);
          }
        `}} />
      </head>
      <body className="min-h-screen bg-surface font-body-md text-on-surface antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
