/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { classNames } from 'primereact/utils';
import { Menu } from 'primereact/menu';
import { MenuItem } from 'primereact/menuitem';
import React, { forwardRef, useContext, useImperativeHandle, useMemo, useRef } from 'react';
import { AppTopbarRef } from '@/types';
import { LayoutContext } from './context/layoutcontext';
import { useAuth } from './context/authcontext';
import Logo from '@/public/assets/telemetryX.png'

const AppTopbar = forwardRef<AppTopbarRef>((props, ref) => {
    const { layoutConfig, layoutState, onMenuToggle, showProfileSidebar } = useContext(LayoutContext);
    const { user, logout } = useAuth();
    const menubuttonRef = useRef(null);
    const topbarmenuRef = useRef(null);
    const topbarmenubuttonRef = useRef(null);
    const userMenuRef = useRef<Menu>(null);

    useImperativeHandle(ref, () => ({
        menubutton: menubuttonRef.current,
        topbarmenu: topbarmenuRef.current,
        topbarmenubutton: topbarmenubuttonRef.current
    }));

    const userInitial = useMemo(() => {
        const source = user?.displayName || user?.email || '';
        return source ? source.charAt(0).toUpperCase() : '?';
    }, [user]);

    const userMenuItems: MenuItem[] = useMemo(
        () => [
            {
                template: () => (
                    <div className="px-3 py-2">
                        <div className="font-medium text-900">{user?.displayName || user?.email || 'User'}</div>
                        {user?.email && <div className="text-500 text-sm">{user.email}</div>}
                        {user?.role && (
                            <div className="mt-2">
                                <span
                                    className={classNames('text-xs font-medium px-2 py-1 border-round', {
                                        'bg-primary text-white': user.role === 'admin',
                                        'surface-200 text-700': user.role !== 'admin'
                                    })}
                                >
                                    {user.role.toUpperCase()}
                                </span>
                            </div>
                        )}
                    </div>
                )
            },
            { separator: true },
            {
                label: 'Sign out',
                icon: 'pi pi-sign-out',
                command: () => {
                    logout();
                }
            }
        ],
        [user, logout]
    );

    return (
        <div className="layout-topbar">
            <button ref={menubuttonRef} type="button" className="p-link layout-menu-button layout-topbar-button" onClick={onMenuToggle}>
                <i className="pi pi-bars" />
            </button>

            <Link href="/" className="layout-topbar-logo">
                <img src={Logo.src} height={'35px'} alt="logo" />
                <span>Telemetry X</span>
            </Link>

            <button ref={topbarmenubuttonRef} type="button" className="p-link layout-topbar-menu-button layout-topbar-button" onClick={showProfileSidebar}>
                <i className="pi pi-ellipsis-v" />
            </button>

            <div ref={topbarmenuRef} className={classNames('layout-topbar-menu', { 'layout-topbar-menu-mobile-active': layoutState.profileSidebarVisible })}>
                <Link href="/apps">
                    <button type="button" className="p-link layout-topbar-button">
                        <i className="pi pi-th-large"></i>
                        <span>Apps</span>
                    </button>
                </Link>
                <Link href="/apps/register">
                    <button type="button" className="p-link layout-topbar-button">
                        <i className="pi pi-plus-circle"></i>
                        <span>Register</span>
                    </button>
                </Link>

                {user ? (
                    <>
                        <Menu ref={userMenuRef} model={userMenuItems} popup popupAlignment="right" />
                        <button
                            type="button"
                            className="p-link layout-topbar-button"
                            aria-label="User menu"
                            aria-haspopup
                            onClick={(e) => userMenuRef.current?.toggle(e)}
                        >
                            <span
                                className="flex align-items-center justify-content-center border-circle bg-primary text-white font-bold"
                                style={{ width: '1.75rem', height: '1.75rem', fontSize: '0.85rem' }}
                            >
                                {userInitial}
                            </span>
                            <span>{user.displayName || user.email}</span>
                        </button>
                    </>
                ) : (
                    <Link href="/auth/login">
                        <button type="button" className="p-link layout-topbar-button">
                            <i className="pi pi-sign-in"></i>
                            <span>Sign in</span>
                        </button>
                    </Link>
                )}
            </div>
        </div>
    );
});

AppTopbar.displayName = 'AppTopbar';

export default AppTopbar;
