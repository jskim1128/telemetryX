/* eslint-disable @next/next/no-img-element */

import React, { useContext } from 'react';
import { LayoutContext } from './context/layoutcontext';
import packageInfo from '../package.json';
import Logo from '@/public/assets/telemetryX_1.png'

const AppFooter = () => {
    const { layoutConfig } = useContext(LayoutContext);

    return (
        <div className="layout-footer">
            <span className="font-medium ml-2 mr-2">Feature Tracking v{packageInfo.version}</span>
            <img src={Logo.src} alt="Logo" height="20" className="mr-2" />
            by
            <span className="font-medium ml-2">A&A-OI-Sol</span>
        </div>
    );
};

export default AppFooter;
