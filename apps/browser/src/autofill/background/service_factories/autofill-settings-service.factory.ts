import { AutofillSettingsService } from "@bitwarden/common/autofill/services/autofill-settings.service";

import {
  CachedServices,
  factory,
  FactoryOptions,
} from "../../../platform/background/service-factories/factory-options";
import {
  stateProviderFactory,
  StateProviderInitOptions,
} from "../../../platform/background/service-factories/state-provider.factory";

export type AutofillSettingsServiceInitOptions = FactoryOptions & StateProviderInitOptions;

export function autofillSettingsServiceFactory(
  cache: { autofillSettingsService?: AutofillSettingsService } & CachedServices,
  opts: AutofillSettingsServiceInitOptions,
): Promise<AutofillSettingsService> {
  return factory(
    cache,
    "autofillSettingsService",
    opts,
    async () => new AutofillSettingsService(await stateProviderFactory(cache, opts)),
  );
}
