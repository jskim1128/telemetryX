'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Dialog } from 'primereact/dialog';
import { Toast } from 'primereact/toast';
import { Message } from 'primereact/message';
import { useAuth } from '../../../../layout/context/authcontext';

interface CreatedApp {
    app: {
        id: string;
        name: string;
        apiKeyPrefix: string;
        ownerEmail?: string | null;
    };
    apiKey: string;
}

const RegisterAppPage = () => {
    const router = useRouter();
    const toast = useRef<Toast>(null);
    const { loading: authLoading } = useAuth();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<CreatedApp | null>(null);

    // Collapsible Usage examples panel.
    const [examplesExpanded, setExamplesExpanded] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            toast.current?.show({ severity: 'warn', summary: 'Validation', detail: 'App name is required' });
            return;
        }
        setSubmitting(true);
        try {
            // ownerEmail is set server-side from the session — we don't
            // send it from the client so it can't be spoofed.
            const res = await fetch('/api/apps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim() || undefined
                })
            });
            const data = await res.json();
            if (!res.ok) {
                toast.current?.show({ severity: 'error', summary: 'Failed', detail: data?.error || 'Could not register app' });
                return;
            }
            setResult(data);
        } catch (err: any) {
            toast.current?.show({ severity: 'error', summary: 'Network error', detail: err?.message || 'Request failed' });
        } finally {
            setSubmitting(false);
        }
    };

    const copyKey = async () => {
        if (!result) return;
        try {
            await navigator.clipboard.writeText(result.apiKey);
            toast.current?.show({ severity: 'success', summary: 'Copied', detail: 'API key copied to clipboard' });
        } catch {
            toast.current?.show({ severity: 'warn', summary: 'Copy failed', detail: 'Select and copy manually' });
        }
    };

    const handleDone = () => {
        const id = result?.app.id;
        setResult(null);
        setName('');
        setDescription('');
        if (id) router.push(`/?app=${id}`);
    };

    return (
        <div className="grid">
            <Toast ref={toast} />
            <div className="col-12 md:col-8 md:col-offset-2">
                <div className="card">
                    <h3>Register a new app</h3>
                    <p className="text-500 mt-0">
                        Register an app to start sending tracking events. You will receive an API key once — copy and store it securely in your app&apos;s configuration.
                    </p>

                    <form onSubmit={handleSubmit}>
                        <div className="field mt-4">
                            <label htmlFor="name" className="block font-medium mb-2">
                                App name <span className="text-red-500">*</span>
                            </label>
                            <InputText id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. invoicing-portal" maxLength={100} className="w-full" required />
                        </div>
                        <div className="field">
                            <label htmlFor="description" className="block font-medium mb-2">
                                Description
                            </label>
                            <InputTextarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} className="w-full" placeholder="What does this app do?" />
                        </div>
                        <div className="flex justify-content-end">
                            <Button type="submit" label="Register App" icon="pi pi-check" loading={submitting} disabled={authLoading || !name.trim()} />
                        </div>
                    </form>
                </div>

                <div className="card mt-3">
                    <div className="flex align-items-center justify-content-between">
                        <h5 className="m-0">Usage examples</h5>
                        <Button
                            label={examplesExpanded ? 'Hide' : 'Show'}
                            icon={examplesExpanded ? 'pi pi-chevron-up' : 'pi pi-chevron-down'}
                            iconPos="right"
                            text
                            size="small"
                            onClick={() => setExamplesExpanded((v) => !v)}
                            aria-expanded={examplesExpanded}
                            aria-controls="usage-examples-panel"
                        />
                    </div>

                    {examplesExpanded && (
                        <div id="usage-examples-panel" className="mt-3">
                            <p className="text-500 mt-0">After registration, your app sends events with these HTTP requests:</p>

                            <h6>App opened</h6>
                            <pre className="surface-100 p-3 border-round overflow-auto" style={{ fontSize: '0.85rem' }}>
{`curl -X POST https://<your-host>/api/track/app-opened \\
  -H "x-api-key: <YOUR_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"jane@company.com","department":"Finance"}'`}
                            </pre>

                            <h6>Feature triggered</h6>
                            <pre className="surface-100 p-3 border-round overflow-auto" style={{ fontSize: '0.85rem' }}>
{`curl -X POST https://<your-host>/api/track/feature \\
  -H "x-api-key: <YOUR_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"jane@company.com","featureName":"export_csv","department":"Finance"}'`}
                            </pre>

                            <h6>Tag</h6>
                            <pre className="surface-100 p-3 border-round overflow-auto" style={{ fontSize: '0.85rem' }}>
{`curl -X POST https://<your-host>/api/track/tag \\
  -H "x-api-key: <YOUR_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"jane@company.com","tag":"beta-tester","department":"Finance"}'`}
                            </pre>
                        </div>
                    )}
                </div>
            </div>

            <Dialog header="API Key — save this now" visible={!!result} closable={false} modal style={{ width: '90vw', maxWidth: '600px' }} onHide={handleDone}>
                {result && (
                    <div>
                        <Message severity="warn" text="This API key will not be shown again. Save it now. If you lose it, you must rotate the key." className="w-full mb-3" />
                        <div className="mb-3">
                            <div className="text-500 text-sm">App name</div>
                            <div className="font-medium">{result.app.name}</div>
                        </div>
                        <div className="mb-3">
                            <div className="text-500 text-sm">App ID</div>
                            <div className="font-mono">{result.app.id}</div>
                        </div>
                        {result.app.ownerEmail && (
                            <div className="mb-3">
                                <div className="text-500 text-sm">Owner</div>
                                <div className="font-medium">{result.app.ownerEmail}</div>
                            </div>
                        )}
                        <div className="mb-3">
                            <div className="text-500 text-sm">API Key</div>
                            <div className="flex align-items-center gap-2">
                                <code className="surface-100 p-2 border-round flex-1 overflow-auto" style={{ wordBreak: 'break-all' }}>
                                    {result.apiKey}
                                </code>
                                <Button icon="pi pi-copy" onClick={copyKey} tooltip="Copy" tooltipOptions={{ position: 'left' }} />
                            </div>
                        </div>
                        <div className="flex justify-content-end mt-4">
                            <Button label="Done — go to App" icon="pi pi-arrow-right" iconPos="right" onClick={handleDone} />
                        </div>
                    </div>
                )}
            </Dialog>
        </div>
    );
};

export default RegisterAppPage;
