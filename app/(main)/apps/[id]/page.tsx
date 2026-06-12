'use client';

import React, { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

const AppDetailRedirect = () => {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const id = params?.id as string;

    useEffect(() => {
        if (id) router.replace(`/?app=${id}`);
        else router.replace('/');
    }, [id, router]);

    return (
        <div className="grid">
            <div className="col-12">
                <div className="card">
                    <h5>Redirecting…</h5>
                </div>
            </div>
        </div>
    );
};

export default AppDetailRedirect;
