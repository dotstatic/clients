import { PolicyService as AbstractPolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";

import {
  AutofillSettingsServiceInitOptions,
  autofillSettingsServiceFactory,
} from "../../../autofill/background/service_factories/autofill-settings-service.factory";
import {
  CachedServices,
  factory,
  FactoryOptions,
} from "../../../platform/background/service-factories/factory-options";
import {
  stateServiceFactory as stateServiceFactory,
  StateServiceInitOptions,
} from "../../../platform/background/service-factories/state-service.factory";
import { BrowserPolicyService } from "../../services/browser-policy.service";

import {
  organizationServiceFactory,
  OrganizationServiceInitOptions,
} from "./organization-service.factory";

type PolicyServiceFactoryOptions = FactoryOptions;

export type PolicyServiceInitOptions = PolicyServiceFactoryOptions &
  StateServiceInitOptions &
  OrganizationServiceInitOptions &
  AutofillSettingsServiceInitOptions;

export function policyServiceFactory(
  cache: { policyService?: AbstractPolicyService } & CachedServices,
  opts: PolicyServiceInitOptions,
): Promise<AbstractPolicyService> {
  return factory(
    cache,
    "policyService",
    opts,
    async () =>
      new BrowserPolicyService(
        await stateServiceFactory(cache, opts),
        await organizationServiceFactory(cache, opts),
        await autofillSettingsServiceFactory(cache, opts),
      ),
  );
}
