export interface ProviderInfo {
    name: string;
}

export function providerInfoFromSocialId(url: string): ProviderInfo | undefined;
