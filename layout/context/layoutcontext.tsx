'use client';
import React, { useState, createContext, useEffect, useRef } from 'react';
import { LayoutState, ChildContainerProps, LayoutConfig, LayoutContextProps } from '@/types';
export const LayoutContext = createContext({} as LayoutContextProps);

const LAYOUT_CONFIG_STORAGE_KEY = 'app-layout-config';

const defaultLayoutConfig: LayoutConfig = {
    ripple: false,
    inputStyle: 'outlined',
    menuMode: 'static',
    colorScheme: 'light',
    theme: 'lara-light-indigo',
    scale: 14
};

const loadLayoutConfig = (): LayoutConfig => {
    if (typeof window === 'undefined') {
        return defaultLayoutConfig;
    }
    try {
        const stored = window.localStorage.getItem(LAYOUT_CONFIG_STORAGE_KEY);
        if (!stored) return defaultLayoutConfig;
        const parsed = JSON.parse(stored) as Partial<LayoutConfig>;
        return { ...defaultLayoutConfig, ...parsed };
    } catch {
        return defaultLayoutConfig;
    }
};

export const LayoutProvider = ({ children }: ChildContainerProps) => {
    const [layoutConfig, setLayoutConfig] = useState<LayoutConfig>(defaultLayoutConfig);
    const hydratedRef = useRef(false);

    // Hydrate from localStorage on mount and apply the saved theme stylesheet.
    useEffect(() => {
        const saved = loadLayoutConfig();
        setLayoutConfig(saved);

        if (typeof document !== 'undefined') {
            const themeLink = document.getElementById('theme-css') as HTMLLinkElement | null;
            if (themeLink && saved.theme) {
                const newHref = `/themes/${saved.theme}/theme.css`;
                if (!themeLink.href.endsWith(newHref)) {
                    themeLink.href = newHref;
                }
            }
            if (typeof saved.scale === 'number') {
                document.documentElement.style.fontSize = saved.scale + 'px';
            }
        }

        hydratedRef.current = true;
    }, []);

    // Persist to localStorage whenever layoutConfig changes (after initial hydration).
    useEffect(() => {
        if (!hydratedRef.current) return;
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(LAYOUT_CONFIG_STORAGE_KEY, JSON.stringify(layoutConfig));
        } catch {
            // ignore storage errors (quota, privacy mode, etc.)
        }
    }, [layoutConfig]);

    const [layoutState, setLayoutState] = useState<LayoutState>({
        staticMenuDesktopInactive: false,
        overlayMenuActive: false,
        profileSidebarVisible: false,
        configSidebarVisible: false,
        staticMenuMobileActive: false,
        menuHoverActive: false
    });

    const onMenuToggle = () => {
        if (isOverlay()) {
            setLayoutState((prevLayoutState) => ({ ...prevLayoutState, overlayMenuActive: !prevLayoutState.overlayMenuActive }));
        }

        if (isDesktop()) {
            setLayoutState((prevLayoutState) => ({ ...prevLayoutState, staticMenuDesktopInactive: !prevLayoutState.staticMenuDesktopInactive }));
        } else {
            setLayoutState((prevLayoutState) => ({ ...prevLayoutState, staticMenuMobileActive: !prevLayoutState.staticMenuMobileActive }));
        }
    };

    const showProfileSidebar = () => {
        setLayoutState((prevLayoutState) => ({ ...prevLayoutState, profileSidebarVisible: !prevLayoutState.profileSidebarVisible }));
    };

    const isOverlay = () => {
        return layoutConfig.menuMode === 'overlay';
    };

    const isDesktop = () => {
        return window.innerWidth > 991;
    };

    const value: LayoutContextProps = {
        layoutConfig,
        setLayoutConfig,
        layoutState,
        setLayoutState,
        onMenuToggle,
        showProfileSidebar
    };

    return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
};
