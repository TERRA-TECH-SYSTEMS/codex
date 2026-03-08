// ============================================================================
// CodeEX v5 — Gixsis Backend Module
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Registers TerraForge language models and the Gixsis Proxy on the backend.
// Uses ConnectionContainerModule so LanguageModelRegistry is in scope.
// ============================================================================

import { ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    GixsisProxyService,
    GIXSIS_PROXY_SERVICE_PATH,
} from '../common/proxy-service';
import {
    TerraForgeLanguageModelsManager,
    TERRAFORGE_LANGUAGE_MODELS_MANAGER_PATH
} from '../common/terraforge-types';
import { ProxyBackendContribution } from './proxy-backend-contribution';
import { TerraForgeLanguageModelsManagerImpl } from './terraforge-language-models-manager';

const gixsisConnectionModule = ConnectionContainerModule.create(({ bind }) => {
    bind(TerraForgeLanguageModelsManagerImpl).toSelf().inSingletonScope();
    bind(TerraForgeLanguageModelsManager).toService(TerraForgeLanguageModelsManagerImpl);
    bind(ConnectionHandler)
        .toDynamicValue(ctx =>
            new RpcConnectionHandler(
                TERRAFORGE_LANGUAGE_MODELS_MANAGER_PATH,
                () => ctx.container.get(TerraForgeLanguageModelsManager)
            )
        )
        .inSingletonScope();
});

export default new ContainerModule(bind => {
    bind(ConnectionContainerModule).toConstantValue(gixsisConnectionModule);

    // Gixsis Proxy — auto-starts on backend launch, exposes RPC to frontend
    bind(ProxyBackendContribution).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(ProxyBackendContribution);
    bind(GixsisProxyService).toService(ProxyBackendContribution);
    bind(ConnectionHandler)
        .toDynamicValue(ctx =>
            new RpcConnectionHandler(
                GIXSIS_PROXY_SERVICE_PATH,
                () => ctx.container.get(GixsisProxyService)
            )
        )
        .inSingletonScope();
});
