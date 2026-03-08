/********************************************************************************
 * Copyright (C) 2026 TerraTech Systems. All rights reserved.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { WindowService } from '@theia/core/lib/browser/window/window-service';
import * as React from 'react';

export interface ExternalBrowserLinkProps {
    text: string;
    url: string;
    windowService: WindowService;
}

export function renderProductName(): React.ReactNode {
    return <h1>Code<span className="gs-blue-header">EX</span></h1>;
}

function BrowserLink(props: ExternalBrowserLinkProps): JSX.Element {
    return <a
        role={'button'}
        tabIndex={0}
        href={props.url}
        target='_blank'
    >
        {props.text}
    </a>;
}

export function renderWhatIs(windowService: WindowService): React.ReactNode {
    return <div className='gs-section'>
        <h3 className='gs-section-header'>
            What is this?
        </h3>
        <div>
            CodeEX is a sovereign IDE built by <BrowserLink text="TerraTech Systems"
                url="https://terratechsystems.com" windowService={windowService} ></BrowserLink> for
            developers who demand full control over their tools and AI integrations.
        </div>
        <div>
            CodeEX supports a rich extension ecosystem and features native AI assistance
            powered by the Gixsis model.
        </div>
    </div>;
}

export function renderExtendingCustomizing(windowService: WindowService): React.ReactNode {
    return <div className='gs-section'>
        <h3 className='gs-section-header'>
            Extensions
        </h3>
        <div >
            You can extend CodeEX at runtime by installing extensions from the built-in extension marketplace.
            Open the extension view to browse and install available extensions.
        </div>
    </div>;
}

export function renderSupport(windowService: WindowService): React.ReactNode {
    return <div className='gs-section'>
        <h3 className='gs-section-header'>
            Support
        </h3>
        <div>
            For support, documentation, and professional services, visit <BrowserLink text="TerraTech Systems"
                url="https://terratechsystems.com" windowService={windowService} ></BrowserLink>.
        </div>
    </div>;
}

export function renderTickets(windowService: WindowService): React.ReactNode {
    return <div className='gs-section'>
        <h3 className='gs-section-header'>
            Feedback
        </h3>
        <div >
            If you encounter issues or have feature requests,
            please contact <BrowserLink text="TerraTech Systems Support"
                url="https://terratechsystems.com/support" windowService={windowService} ></BrowserLink>.
        </div>
    </div>;
}

export function renderSourceCode(windowService: WindowService): React.ReactNode {
    return <></>;
}

export function renderDocumentation(windowService: WindowService): React.ReactNode {
    return <div className='gs-section'>
        <h3 className='gs-section-header'>
            Documentation
        </h3>
        <div >
            Visit <BrowserLink text="TerraTech Systems" url="https://terratechsystems.com/codex/docs"
                windowService={windowService} ></BrowserLink> for guides, tutorials, and API reference.
        </div>
    </div>;
}

export function renderCollaboration(windowService: WindowService): React.ReactNode {
    return <div className='gs-section'>
        <h3 className='gs-section-header'>
            Collaboration
        </h3>
        <div >
            The IDE features a built-in collaboration feature.
            You can share your workspace with others and work together in real-time by clicking on the <i>Collaborate</i> item in the status bar.
        </div>
    </div>;
}

export function renderDownloads(): React.ReactNode {
    return <div className='gs-section'>
        <h3 className='gs-section-header'>
            Updates and Downloads
        </h3>
        <div className='gs-action-container'>
            You can update CodeEX directly in this application by navigating to
            File {'>'} Preferences {'>'} Check for Updates. The application will also check for updates
            after each launch automatically.
        </div>
    </div>;
}
