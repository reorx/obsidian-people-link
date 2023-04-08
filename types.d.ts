/* eslint-disable */
// from: https://github.com/mdelobelle/obsidian_supercharged_links/blob/master/types.d.ts
import 'obsidian';

import { DataviewApi } from 'obsidian-dataview';


declare module "obsidian" {
    interface App {
        plugins: {
            enabledPlugins: Set<string>;
            plugins: {
                [id: string]: any;
                dataview?: {
                    api?: DataviewApi;
                };
            };
        };
    }
    interface MetadataCache {
        on(
            name: "dataview:api-ready",
            callback: (api: DataviewApi) => any,
            ctx?: any
        ): EventRef;
        on(
            name: "dataview:metadata-change",
            callback: (
                ...args:
                    | [op: "rename", file: TAbstractFile, oldPath?: string]
                    | [op: "delete", file: TFile, oldPath?: string]
                    | [op: "update", file: TFile, oldPath?: string]
            ) => any,
            ctx?: any
        ): EventRef;
    }
}
