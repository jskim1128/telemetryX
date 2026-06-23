'use client';

import React, { Suspense, useState } from 'react';
import { Tooltip } from 'primereact/tooltip';
import AiChatPanel from './AiChatPanel';
import { Button } from 'primereact/button';

const AiChatLauncher: React.FC = () => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Tooltip target=".ai-chat-launcher" content="Ask TelemetryX Assistant" position="left" />
            <Button
                className="ai-chat-launcher"
                onClick={() => setOpen(true)}
                icon="fi fi-rr-sparkles"
                size='large'
            >
            </Button>
            {/* Sidebar uses useSearchParams via AiChatPanel — wrap in Suspense to satisfy Next.js */}
            <Suspense fallback={null}>
                <AiChatPanel visible={open} onHide={() => setOpen(false)} />
            </Suspense>
        </>
    );
};

export default AiChatLauncher;
