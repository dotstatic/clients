import { BehaviorSubject, filter, firstValueFrom, map, Observable, switchMap, tap } from "rxjs";
import { Jsonify } from "type-fest";

import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { PolicyType } from "@bitwarden/common/admin-console/enums";
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
    this._policies.pipe(this.handleActivateAutofillPolicy.bind(this)).subscribe();
  }

  private async getActivateAutoFillOnPageLoadFromPolicy(): Promise<boolean> {
    return await firstValueFrom(this.autofillSettingsService.activateAutoFillOnPageLoadFromPolicy$);
  }

  private async setActivateAutoFillOnPageLoadFromPolicy(autofillEnabled: boolean): Promise<void> {
    this.autofillSettingsService.setActivateAutoFillOnPageLoadFromPolicy(!autofillEnabled);
  }

  private async getAutofillOnLoad(): Promise<boolean> {
    return await firstValueFrom(this.autofillSettingsService.autofillOnLoad$);
  }

  /**
   * If the ActivateAutofill policy is enabled, save a flag indicating if we need to
   * enable Autofill on page load.
   */
  private handleActivateAutofillPolicy(policies$: Observable<Policy[]>) {
    return policies$.pipe(
      map((policies) => policies.find((p) => p.type == PolicyType.ActivateAutofill && p.enabled)),
      filter((p) => p != null),
      switchMap(async (_) => [
        await this.getActivateAutoFillOnPageLoadFromPolicy(),
        await this.getAutofillOnLoad(),
      ]),
      tap(([activated, autofillEnabled]) => {
        if (activated === undefined) {
          // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.setActivateAutoFillOnPageLoadFromPolicy(!autofillEnabled);
        }
      }),
    );
  }
}
