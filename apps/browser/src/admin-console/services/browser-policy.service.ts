import { BehaviorSubject } from "rxjs";
import { Jsonify } from "type-fest";

import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { Policy } from "@bitwarden/common/admin-console/models/domain/policy";
import { PolicyService } from "@bitwarden/common/admin-console/services/policy/policy.service";
import { AutofillSettingsServiceAbstraction } from "@bitwarden/common/autofill/services/autofill-settings.service";
import { StateService } from "@bitwarden/common/platform/abstractions/state.service";

import { browserSession, sessionSync } from "../../platform/decorators/session-sync-observable";

@browserSession
export class BrowserPolicyService extends PolicyService {
  @sessionSync({
    initializer: (obj: Jsonify<Policy>) => Object.assign(new Policy(), obj),
    initializeAs: "array",
  })
  protected _policies: BehaviorSubject<Policy[]>;

  constructor(
    stateService: StateService,
    organizationService: OrganizationService,
    autofillSettingsService: AutofillSettingsServiceAbstraction,
  ) {
    super(stateService, organizationService, autofillSettingsService);
    this._policies
      .pipe(this.autofillSettingsService.handleActivateAutofillPolicy.bind(this))
      .subscribe();
  }
}
