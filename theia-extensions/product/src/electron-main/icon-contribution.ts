/********************************************************************************
 * Copyright (C) 2021 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as os from 'os';
import * as path from 'path';

import { ElectronMainApplication, ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';

import { injectable } from '@theia/core/shared/inversify';
import { BrowserWindow } from '@theia/core/electron-shared/electron';

@injectable()
export class IconContribution implements ElectronMainApplicationContribution {

    onStart(application: ElectronMainApplication): void {
        const platform = os.platform();
        if (platform === 'linux' || platform === 'win32') {
            const windowOptions = application.config.electron.windowOptions;
            const iconPath = path.join(__dirname, '../../resources/icons/WindowIcon/512-512.png');
            if (windowOptions && windowOptions.icon === undefined) {
                windowOptions.icon = iconPath;
            }
            for (const window of BrowserWindow.getAllWindows()) {
                window.setIcon(iconPath);
            }
        }
    }
}
