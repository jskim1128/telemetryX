/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useContext, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Password } from 'primereact/password';
import { Toast } from 'primereact/toast';
import { classNames } from 'primereact/utils';
import { LayoutContext } from '../../../../layout/context/layoutcontext';
import Logo from '@/public/assets/telemetryX.png'

const LoginForm = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const toast = useRef<Toast>(null);
    const { layoutConfig } = useContext(LayoutContext);

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const containerClassName = classNames(
        'surface-ground flex align-items-center justify-content-center min-h-screen min-w-screen overflow-hidden',
        { 'p-input-filled': layoutConfig.inputStyle === 'filled' }
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password) {
            toast.current?.show({
                severity: 'warn',
                summary: 'Missing fields',
                detail: 'Enter your username and password.'
            });
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username.trim(), password })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.current?.show({
                    severity: 'error',
                    summary: 'Sign-in failed',
                    detail: data?.error || 'Invalid credentials'
                });
                return;
            }

            const next = searchParams?.get('next') || '/';
            // Use a hard navigation so the middleware re-reads the cookie
            // and so any client-side auth context refreshes cleanly.
            window.location.assign(next);
        } catch (err: any) {
            toast.current?.show({
                severity: 'error',
                summary: 'Network error',
                detail: err?.message || 'Could not reach the server.'
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className={containerClassName}>
            <Toast ref={toast} />
            <div className="flex flex-column align-items-center justify-content-center">
                <img src={Logo.src} alt="logo" className="mb-5 h-6rem flex-shrink-0" />
                <div
                    style={{
                        borderRadius: '56px',
                        padding: '0.3rem',
                        background: 'linear-gradient(180deg, var(--primary-color) 10%, rgba(33, 150, 243, 0) 30%)'
                    }}
                >
                    <div className="w-full surface-card py-8 px-5 sm:px-8" style={{ borderRadius: '53px' }}>
                        <div className="text-center mb-5">
                            <div className="text-900 text-3xl font-medium mb-3">Welcome back</div>
                            <span className="text-600 font-medium">Sign in with your corporate account</span>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <label htmlFor="username" className="block text-900 text-xl font-medium mb-2">
                                Username
                            </label>
                            <InputText
                                id="username"
                                type="text"
                                placeholder="Employee ID or email"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full md:w-30rem mb-5"
                                style={{ padding: '1rem' }}
                                autoFocus
                                autoComplete="username"
                                disabled={submitting}
                            />

                            <label htmlFor="password" className="block text-900 font-medium text-xl mb-2">
                                Password
                            </label>
                            <Password
                                inputId="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Password"
                                toggleMask
                                feedback={false}
                                className="w-full mb-5"
                                inputClassName="w-full p-3 md:w-30rem"
                                inputStyle={{ width: '100%' }}
                                // @ts-ignore — autoComplete forwards to the inner input
                                autoComplete="current-password"
                                disabled={submitting}
                            />

                            <div className="text-500 text-sm mb-4">
                                <i className="pi pi-info-circle mr-2" />
                                You will stay signed in on this device for 30 days.
                            </div>

                            <Button
                                type="submit"
                                label={submitting ? 'Signing in…' : 'Sign In'}
                                className="w-full p-3 text-xl"
                                loading={submitting}
                                disabled={submitting}
                            />
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

const LoginPage = () => (
    // useSearchParams must be inside a Suspense boundary in the App Router.
    <Suspense fallback={null}>
        <LoginForm />
    </Suspense>
);

export default LoginPage;
