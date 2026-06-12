import { Metadata } from 'next';
import React from 'react';

interface FullPageLayoutProps {
    children: React.ReactNode;
}

export const metadata: Metadata = {
    title: 'Sign in — Feature Tracking',
    description: 'Sign in to the Feature Tracking dashboard.',
    robots: { index: false, follow: false },
    viewport: { initialScale: 1, width: 'device-width' }
};

/**
 * Layout for "full page" routes (e.g. the login page) that should NOT
 * render the Sakai topbar/sidebar/footer chrome.
 */
export default function FullPageLayout({ children }: FullPageLayoutProps) {
    return <>{children}</>;
}
