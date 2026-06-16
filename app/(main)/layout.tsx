import { Metadata } from 'next';
import { Suspense } from 'react';
import Layout from '../../layout/layout';

interface AppLayoutProps {
    children: React.ReactNode;
}

export const metadata: Metadata = {
    title: 'Feature Tracking',
    description: 'Track app opens, feature triggers, and tags across your apps.',
    robots: { index: false, follow: false },
    viewport: { initialScale: 1, width: 'device-width' },
    icons: {
        icon: '/favicon.ico'
    }
};

export default function AppLayout({ children }: AppLayoutProps) {
    return (
        <Suspense fallback={null}>
            <Layout>{children}</Layout>
        </Suspense>
    );
}
